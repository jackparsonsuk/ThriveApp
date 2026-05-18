import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { addMonths, isBefore, isEqual, addDays, addWeeks } from 'date-fns';
import { Resend } from 'resend';
import * as ics from 'ics';
import { setGlobalOptions } from 'firebase-functions/v2';

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
        
        // Find the latest booking created for this template
        const latestBookingSnapshot = await db.collection(BOOKINGS_COLLECTION)
            .where('recurringTemplateId', '==', templateDoc.id)
            .orderBy('startTime', 'desc')
            .limit(1)
            .get();

        if (latestBookingSnapshot.empty) {
            console.log(`Template ${templateDoc.id} has no instances. Skipping... (should have been created on UI)`);
            continue;
        }

        const latestBooking = latestBookingSnapshot.docs[0].data();
        let currentStart = latestBooking.startTime.toDate();
        let currentEnd = latestBooking.endTime.toDate();

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
            const resendApiKey = process.env.RESEND_API_KEY;
            if (!resendApiKey) {
                console.error('RESEND_API_KEY is not defined. Cannot send confirmation email.');
                return;
            }

            const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
            const resend = new Resend(resendApiKey);

            try {
                // Fetch the client details
                const clientDoc = await db.collection('users').doc(afterData.userId).get();
                if (!clientDoc.exists) {
                    console.error(`Client ${afterData.userId} not found`);
                    return;
                }
                const clientData = clientDoc.data();
                const clientEmail = clientData?.email;
                const clientName = clientData?.name || 'Client';

                // Fetch the PT details
                const ptDoc = await db.collection('users').doc(afterData.ptId).get();
                const ptName = ptDoc.exists ? ptDoc.data()?.name : 'Your Personal Trainer';

                if (!clientEmail) {
                    console.error(`Client ${afterData.userId} has no email address`);
                    return;
                }

                // Generate ICS calendar event
                const startTime = afterData.startTime.toDate();
                const endTime = afterData.endTime.toDate();

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

                const emailResponse = await resend.emails.send({
                    from: fromEmail === 'onboarding@resend.dev' ? 'onboarding@resend.dev' : `Thrive Collective <${fromEmail}>`,
                    to: clientEmail,
                    subject: `Booking Confirmed: PT Session with ${ptName}`,
                    html: `
                        <p>Hi ${clientName},</p>
                        <p>Your Personal Training session with <strong>${ptName}</strong> is confirmed!</p>
                        <p>Please find the calendar invite attached.</p>
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
    }
);
