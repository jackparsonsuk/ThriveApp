import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { addMonths, isBefore, isEqual, addDays, addWeeks } from 'date-fns';
import { Resend } from 'resend';
import * as ics from 'ics';
import { setGlobalOptions } from 'firebase-functions/v2';
import { randomBytes } from 'crypto';

setGlobalOptions({ region: 'europe-west2' });

admin.initializeApp();
const db = admin.firestore();

const BOOKINGS_COLLECTION = 'bookings';
const RECURRING_TEMPLATES_COLLECTION = 'recurring_templates';
const GENERATION_WINDOW_MONTHS = 3;

/**
 * Scheduled function that runs every day at 2:00 AM.
 * It queries all active recurring templates and generates new sessions
 * to maintain a rolling window of future bookings.
 */
export const generateWeeklySessions = functions.scheduler.onSchedule('0 2 * * *', async (event) => {
    const templatesSnapshot = await db
        .collection(RECURRING_TEMPLATES_COLLECTION)
        .where('status', '==', 'active')
        .get();

    if (templatesSnapshot.empty) {
        console.log('No active recurring templates found.');
        return;
    }

    const now = new Date();
    const maxGenerationTarget = addMonths(now, GENERATION_WINDOW_MONTHS);

    let generatedCount = 0;
    const batch = db.batch();
    let batchOperations = 0;
    
    // Process each template
    for (const templateDoc of templatesSnapshot.docs) {
        const templateData = templateDoc.data();
        
        // Find the latest slot the series itself produced. A rescheduled instance keeps the
        // slot it was given in originalStartTime, so moving one session (even the last one,
        // or to an earlier day) neither shifts the series nor recreates the slot it left.
        // Looking at the newest few covers an instance moved several occurrences earlier.
        const recentBookingsSnapshot = await db.collection(BOOKINGS_COLLECTION)
            .where('recurringTemplateId', '==', templateDoc.id)
            .orderBy('startTime', 'desc')
            .limit(10)
            .get();

        if (recentBookingsSnapshot.empty) {
            console.log(`Template ${templateDoc.id} has no instances. Skipping... (should have been created on UI)`);
            continue;
        }

        let currentStart: Date | null = null;
        let currentEnd: Date | null = null;
        for (const bookingDoc of recentBookingsSnapshot.docs) {
            const booking = bookingDoc.data();
            const slotStart: Date = (booking.originalStartTime ?? booking.startTime).toDate();
            if (!currentStart || slotStart > currentStart) {
                currentStart = slotStart;
                currentEnd = (booking.originalEndTime ?? booking.endTime).toDate();
            }
        }
        if (!currentStart || !currentEnd) continue;

        // Figure out if there's a hard stop date
        const hardStopDate = templateData.endDate 
            ? (templateData.endDate.toDate ? templateData.endDate.toDate() : new Date(templateData.endDate))
            : maxGenerationTarget;
            
        const targetStopDate = isBefore(hardStopDate, maxGenerationTarget) ? hardStopDate : maxGenerationTarget;

        // Advance to the next occurrence
        if (templateData.frequency === 'daily') {
            currentStart = addDays(currentStart, 1);
            currentEnd = addDays(currentEnd, 1);
        } else if (templateData.frequency === 'weekly') {
            currentStart = addWeeks(currentStart, 1);
            currentEnd = addWeeks(currentEnd, 1);
        } else if (templateData.frequency === 'bi-weekly') {
            currentStart = addWeeks(currentStart, 2);
            currentEnd = addWeeks(currentEnd, 2);
        } else if (templateData.frequency === 'monthly') {
            currentStart = addMonths(currentStart, 1);
            currentEnd = addMonths(currentEnd, 1);
        }

        // Generate instances up to the target date
        while (isBefore(currentStart, targetStopDate) || isEqual(currentStart, targetStopDate)) {
            const instanceRef = db.collection(BOOKINGS_COLLECTION).doc();
            batch.set(instanceRef, {
                userId: templateData.userId,
                ptId: templateData.ptId,
                type: templateData.type,
                status: 'confirmed',
                startTime: admin.firestore.Timestamp.fromDate(currentStart),
                endTime: admin.firestore.Timestamp.fromDate(currentEnd),
                recurringTemplateId: templateDoc.id,
                isException: false
            });

            generatedCount++;
            batchOperations++;

            // Firestore batch has a limit of 500 operations. We commit early if we reach 400.
            if (batchOperations >= 400) {
                await batch.commit();
                batchOperations = 0;
            }

            // Increment for next iteration
            if (templateData.frequency === 'daily') {
                currentStart = addDays(currentStart, 1);
                currentEnd = addDays(currentEnd, 1);
            } else if (templateData.frequency === 'weekly') {
                currentStart = addWeeks(currentStart, 1);
                currentEnd = addWeeks(currentEnd, 1);
            } else if (templateData.frequency === 'bi-weekly') {
                currentStart = addWeeks(currentStart, 2);
                currentEnd = addWeeks(currentEnd, 2);
            } else if (templateData.frequency === 'monthly') {
                currentStart = addMonths(currentStart, 1);
                currentEnd = addMonths(currentEnd, 1);
            }
        }
    }

    if (batchOperations > 0) {
        await batch.commit();
    }

    console.log(`Generated ${generatedCount} new recurring sessions.`);
});

const FREQUENCY_LABELS: Record<string, string> = {
    'daily': 'every day',
    'weekly': 'every week',
    'bi-weekly': 'every two weeks',
    'monthly': 'every month',
};

const LONDON_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
});

const LONDON_DATE = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/London'
});

interface SessionEmailDetails {
    userId: string;
    ptId: string;
    startTime: Date;
    endTime: Date;
    // The booking the invite is for. Gives the .ics a stable UID, so a later reschedule
    // email updates the same calendar event instead of adding a second one.
    bookingId?: string;
    // Set for a recurring series: the email describes the series and the invite covers the first session
    recurrence?: { frequency: string; endDate?: Date | null };
    // Set when the session was moved: the email says it moved from this time to startTime
    previousStartTime?: Date;
}

const calendarUid = (bookingId: string) => `booking-${bookingId}@thrivecollective`;

/**
 * Emails the client a PT session confirmation with a calendar invite (.ics) attached.
 * Used both when a PT confirms a client's request and when a PT books on a client's behalf.
 */
async function sendSessionConfirmationEmail(details: SessionEmailDetails) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
        console.error('RESEND_API_KEY is not defined. Cannot send confirmation email.');
        return;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const resend = new Resend(resendApiKey);

    try {
        // Fetch the client details
        const clientDoc = await db.collection('users').doc(details.userId).get();
        if (!clientDoc.exists) {
            console.error(`Client ${details.userId} not found`);
            return;
        }
        const clientData = clientDoc.data();
        const clientEmail = clientData?.email;
        const clientName = clientData?.name || 'Client';

        // Fetch the PT details
        const ptDoc = await db.collection('users').doc(details.ptId).get();
        const ptName = ptDoc.exists ? ptDoc.data()?.name : 'Your Personal Trainer';

        if (!clientEmail) {
            console.error(`Client ${details.userId} has no email address`);
            return;
        }

        // Generate ICS calendar event
        const { startTime, endTime, recurrence, previousStartTime, bookingId } = details;

        const eventDetails: ics.EventAttributes = {
            start: [
                startTime.getFullYear(),
                startTime.getMonth() + 1,
                startTime.getDate(),
                startTime.getHours(),
                startTime.getMinutes()
            ],
            end: [
                endTime.getFullYear(),
                endTime.getMonth() + 1,
                endTime.getDate(),
                endTime.getHours(),
                endTime.getMinutes()
            ],
            title: `PT Session with ${ptName}`,
            description: `Your Personal Training session with ${ptName} is confirmed.`,
            status: 'CONFIRMED',
            // Same UID for every invite about this booking, and a higher SEQUENCE each time,
            // so calendar apps update the existing event when the session moves.
            ...(bookingId ? { uid: calendarUid(bookingId), sequence: Math.floor(Date.now() / 1000) } : {}),
            organizer: { name: ptName, email: fromEmail },
            attendees: [
                { name: clientName, email: clientEmail, rsvp: true, partstat: 'ACCEPTED', role: 'REQ-PARTICIPANT' }
            ]
        };

        const { error, value } = ics.createEvent(eventDetails);

        if (error || !value) {
            console.error('Failed to generate ICS file', error);
            return;
        }

        const attachments = [{
            filename: 'invite.ics',
            content: Buffer.from(value).toString('base64'),
            type: 'text/calendar'
        }];

        const formattedDateTime = LONDON_DATE_TIME.format(startTime);

        let subject = `Booking Confirmed: PT Session with ${ptName}`;
        let sessionHtml = `
                <p>Your Personal Training session with <strong>${ptName}</strong> is confirmed!</p>
                <p><strong>Date &amp; Time:</strong> ${formattedDateTime}</p>
                <p>Please find the calendar invite attached.</p>`;

        if (recurrence) {
            const frequencyLabel = FREQUENCY_LABELS[recurrence.frequency] || 'regularly';
            const untilText = recurrence.endDate
                ? `until ${LONDON_DATE.format(recurrence.endDate)}`
                : 'until further notice';
            subject = `Booking Confirmed: Recurring PT Sessions with ${ptName}`;
            sessionHtml = `
                <p>Your recurring Personal Training sessions with <strong>${ptName}</strong> are confirmed!</p>
                <p><strong>First session:</strong> ${formattedDateTime}</p>
                <p><strong>Repeats:</strong> ${frequencyLabel}, ${untilText}</p>
                <p>The attached calendar invite is for your first session. You can see all your upcoming sessions in the Thrive app.</p>`;
        } else if (previousStartTime) {
            subject = `Session Moved: PT Session with ${ptName}`;
            sessionHtml = `
                <p>Your Personal Training session with <strong>${ptName}</strong> has been moved.</p>
                <p><strong>Was:</strong> <s>${LONDON_DATE_TIME.format(previousStartTime)}</s></p>
                <p><strong>Now:</strong> ${formattedDateTime}</p>
                <p>Please find the updated calendar invite attached.</p>`;
        }

        const emailResponse = await resend.emails.send({
            from: fromEmail === 'onboarding@resend.dev' ? 'onboarding@resend.dev' : `Thrive Collective <${fromEmail}>`,
            to: clientEmail,
            subject,
            html: `
                <p>Hi ${clientName},</p>${sessionHtml}
                <br/>
                <p>Best regards,</p>
                <p>Thrive Collective</p>
            `,
            attachments: attachments
        });

        console.log(`Confirmation email sent to ${clientEmail}`, emailResponse);
    } catch (error) {
        console.error('Error sending confirmation email:', error);
    }
}

/**
 * Triggered when a booking is updated.
 * Checks if the status changed from 'pending' to 'confirmed' for a PT session,
 * and sends an email to the client with a calendar invite (.ics).
 */
export const onBookingConfirmed = functions.firestore.onDocumentUpdated(
    `${BOOKINGS_COLLECTION}/{bookingId}`,
    async (event) => {
        const beforeData = event.data?.before.data();
        const afterData = event.data?.after.data();

        if (!beforeData || !afterData) return;

        // Check if the status changed from pending to confirmed, and it is a PT booking
        if (beforeData.status === 'pending' && afterData.status === 'confirmed' && afterData.type === 'pt') {
            await sendSessionConfirmationEmail({
                userId: afterData.userId,
                ptId: afterData.ptId,
                startTime: afterData.startTime.toDate(),
                endTime: afterData.endTime.toDate(),
                bookingId: event.params.bookingId,
            });
        }
    }
);

/**
 * Triggered when a booking is updated.
 * When a PT moves a confirmed PT session, emails the client the old and new times with an
 * updated invite. The invite reuses the booking's calendar UID so it replaces the old event.
 */
export const onBookingRescheduled = functions.firestore.onDocumentUpdated(
    `${BOOKINGS_COLLECTION}/{bookingId}`,
    async (event) => {
        const beforeData = event.data?.before.data();
        const afterData = event.data?.after.data();

        if (!beforeData || !afterData) return;
        if (afterData.type !== 'pt') return;
        if (beforeData.status !== 'confirmed' || afterData.status !== 'confirmed') return;
        if (!beforeData.startTime || !afterData.startTime) return;
        if (beforeData.startTime.isEqual(afterData.startTime)) return;
        if (!afterData.ptId || afterData.userId === afterData.ptId) return;

        await sendSessionConfirmationEmail({
            userId: afterData.userId,
            ptId: afterData.ptId,
            startTime: afterData.startTime.toDate(),
            endTime: afterData.endTime.toDate(),
            bookingId: event.params.bookingId,
            previousStartTime: beforeData.startTime.toDate(),
        });
    }
);

/**
 * Triggered when a booking is created.
 * A PT booking on a client's behalf is written already 'confirmed', so onBookingConfirmed
 * never fires for it; this sends the client the same email.
 * Recurring instances are skipped: the series gets one email from onRecurringSessionCreated.
 */
export const onBookingCreatedForClient = functions.firestore.onDocumentCreated(
    `${BOOKINGS_COLLECTION}/{bookingId}`,
    async (event) => {
        const data = event.data?.data();
        if (!data) return;

        if (data.type !== 'pt' || data.status !== 'confirmed') return;
        if (!data.ptId || data.userId === data.ptId) return;
        if (data.recurringTemplateId) return;

        await sendSessionConfirmationEmail({
            userId: data.userId,
            ptId: data.ptId,
            startTime: data.startTime.toDate(),
            endTime: data.endTime.toDate(),
            bookingId: event.params.bookingId,
        });
    }
);

/**
 * Triggered when a recurring session template is created.
 * Sends the client one email for the whole series. generateWeeklySessions only adds
 * instances (which onBookingCreatedForClient skips), so extending a series sends nothing.
 */
export const onRecurringSessionCreated = functions.firestore.onDocumentCreated(
    `${RECURRING_TEMPLATES_COLLECTION}/{templateId}`,
    async (event) => {
        const data = event.data?.data();
        if (!data) return;

        if (data.type !== 'pt' || data.status !== 'active') return;
        if (!data.ptId || data.userId === data.ptId) return;

        // The template and its instances are written in one batch, so the first instance exists.
        // Using its id for the invite UID lets a later reschedule of it update the same event.
        // Sorted here rather than in the query so it needs no composite index (a series is ~3 months of instances).
        const instances = await db.collection(BOOKINGS_COLLECTION)
            .where('recurringTemplateId', '==', event.params.templateId)
            .get();
        const firstInstance = instances.docs.reduce<admin.firestore.QueryDocumentSnapshot | null>(
            (first, doc) => (!first || doc.data().startTime.toMillis() < first.data().startTime.toMillis() ? doc : first),
            null
        );

        await sendSessionConfirmationEmail({
            userId: data.userId,
            ptId: data.ptId,
            startTime: data.startTime.toDate(),
            endTime: data.endTime.toDate(),
            bookingId: firstInstance?.id,
            recurrence: {
                frequency: data.frequency,
                endDate: data.endDate ? data.endDate.toDate() : null,
            },
        });
    }
);

const CALENDAR_FEEDS_COLLECTION = 'calendar_feeds';
const CALENDAR_FEED_FUNCTION = 'ptCalendarFeed';
// How far back the feed goes, so last week's sessions don't vanish from the PT's calendar
const CALENDAR_FEED_HISTORY_DAYS = 30;

const calendarFeedUrl = (token: string) => {
    const project = process.env.GCLOUD_PROJECT;
    const base = process.env.FUNCTIONS_EMULATOR === 'true'
        ? `http://127.0.0.1:5001/${project}/europe-west2/${CALENDAR_FEED_FUNCTION}`
        : `https://europe-west2-${project}.cloudfunctions.net/${CALENDAR_FEED_FUNCTION}`;
    return `${base}/${token}.ics`;
};

/**
 * Returns the signed-in PT's private calendar feed URL, creating it on first use.
 * Pass { reset: true } to replace the token, so a link shared by mistake stops working.
 * Tokens live in calendar_feeds, which the rules give clients no access to: users docs
 * are readable by every client, so the token can't go there.
 */
export const getCalendarFeedUrl = functions.https.onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in to get your calendar link.');
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'pt' && role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only PTs have a calendar feed.');
    }

    const existing = await db.collection(CALENDAR_FEEDS_COLLECTION).where('userId', '==', uid).get();
    if (!request.data?.reset && !existing.empty) {
        return { url: calendarFeedUrl(existing.docs[0].id) };
    }

    const token = randomBytes(24).toString('hex');
    const batch = db.batch();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    batch.set(db.collection(CALENDAR_FEEDS_COLLECTION).doc(token), {
        userId: uid,
        createdAt: new Date(),
    });
    await batch.commit();

    return { url: calendarFeedUrl(token) };
});

/**
 * Serves a PT's sessions as an .ics feed that Apple/Google Calendar can subscribe to:
 * confirmed PT sessions, pending requests (as tentative), their own blocked time and the
 * group classes they run. Cancelled bookings are left out, which removes them from the
 * subscribed calendar on its next refresh. Calendar apps can't sign in, so the unguessable
 * token in the URL is what protects it.
 */
export const ptCalendarFeed = functions.https.onRequest({ invoker: 'public' }, async (req, res) => {
    const token = req.path.replace(/^\//, '').replace(/\.ics$/, '');
    if (!/^[0-9a-f]{48}$/.test(token)) {
        res.status(404).send('Not found');
        return;
    }

    const feedDoc = await db.collection(CALENDAR_FEEDS_COLLECTION).doc(token).get();
    const ptId: string | undefined = feedDoc.data()?.userId;
    if (!ptId) {
        res.status(404).send('Not found');
        return;
    }

    // Filtered by date here rather than in the query, so it needs no composite index
    const since = addDays(new Date(), -CALENDAR_FEED_HISTORY_DAYS).getTime();
    const bookingsSnapshot = await db.collection(BOOKINGS_COLLECTION).where('ptId', '==', ptId).get();
    const bookings = bookingsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as admin.firestore.DocumentData & { id: string }))
        .filter(b => b.startTime && b.startTime.toMillis() >= since)
        .filter(b =>
            (b.type === 'pt' && (b.status === 'confirmed' || b.status === 'pending')) ||
            (b.type === 'pt_block' && b.status === 'confirmed') ||
            // Each group member has a booking carrying the PT's id; the PT's own one stands for the class
            (b.type === 'group' && b.status === 'confirmed' && b.userId === ptId)
        );

    const clientIds = [...new Set(bookings.filter(b => b.type === 'pt' && b.userId !== ptId).map(b => b.userId as string))];
    const groupIds = [...new Set(bookings.filter(b => b.type === 'group' && b.groupId).map(b => b.groupId as string))];
    const [clientDocs, groupDocs] = await Promise.all([
        clientIds.length ? db.getAll(...clientIds.map(id => db.collection('users').doc(id))) : [],
        groupIds.length ? db.getAll(...groupIds.map(id => db.collection('groups').doc(id))) : [],
    ]);
    const clientNames = new Map(clientDocs.map(doc => [doc.id, doc.data()?.name as string | undefined]));
    const groupNames = new Map(groupDocs.map(doc => [doc.id, doc.data()?.name as string | undefined]));

    const events: ics.EventAttributes[] = bookings.map(b => {
        let title: string;
        let status: ics.EventStatus = 'CONFIRMED';
        if (b.type === 'pt_block') {
            title = b.reason || 'Unavailable';
        } else if (b.type === 'group') {
            title = `Group: ${groupNames.get(b.groupId) || 'Class'}`;
        } else if (b.userId === ptId) {
            title = 'PT session';
        } else {
            const clientName = clientNames.get(b.userId) || 'Client';
            if (b.status === 'pending') {
                title = `Request: ${clientName} (not yet accepted)`;
                status = 'TENTATIVE';
            } else {
                title = `PT: ${clientName}`;
            }
        }
        return {
            uid: calendarUid(b.id),
            start: b.startTime.toMillis(),
            end: b.endTime.toMillis(),
            title,
            status,
        };
    });

    const { error, value } = ics.createEvents(events, {
        calName: 'Thrive sessions',
        productId: 'thrivecollective/pt-calendar',
        method: 'PUBLISH',
    });
    if (error || !value) {
        console.error('Failed to generate calendar feed', error);
        res.status(500).send('Could not build calendar');
        return;
    }

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(value);
});
