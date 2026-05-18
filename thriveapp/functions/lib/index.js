"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBookingConfirmed = exports.generateWeeklySessions = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const date_fns_1 = require("date-fns");
const resend_1 = require("resend");
const ics = __importStar(require("ics"));
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
exports.generateWeeklySessions = functions.scheduler.onSchedule('0 2 * * *', async (event) => {
    const templatesSnapshot = await db
        .collection(RECURRING_TEMPLATES_COLLECTION)
        .where('status', '==', 'active')
        .get();
    if (templatesSnapshot.empty) {
        console.log('No active recurring templates found.');
        return;
    }
    const now = new Date();
    const maxGenerationTarget = (0, date_fns_1.addMonths)(now, GENERATION_WINDOW_MONTHS);
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
        const targetStopDate = (0, date_fns_1.isBefore)(hardStopDate, maxGenerationTarget) ? hardStopDate : maxGenerationTarget;
        // Advance to the next occurrence
        if (templateData.frequency === 'daily') {
            currentStart = (0, date_fns_1.addDays)(currentStart, 1);
            currentEnd = (0, date_fns_1.addDays)(currentEnd, 1);
        }
        else if (templateData.frequency === 'weekly') {
            currentStart = (0, date_fns_1.addWeeks)(currentStart, 1);
            currentEnd = (0, date_fns_1.addWeeks)(currentEnd, 1);
        }
        else if (templateData.frequency === 'bi-weekly') {
            currentStart = (0, date_fns_1.addWeeks)(currentStart, 2);
            currentEnd = (0, date_fns_1.addWeeks)(currentEnd, 2);
        }
        else if (templateData.frequency === 'monthly') {
            currentStart = (0, date_fns_1.addMonths)(currentStart, 1);
            currentEnd = (0, date_fns_1.addMonths)(currentEnd, 1);
        }
        // Generate instances up to the target date
        while ((0, date_fns_1.isBefore)(currentStart, targetStopDate) || (0, date_fns_1.isEqual)(currentStart, targetStopDate)) {
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
                currentStart = (0, date_fns_1.addDays)(currentStart, 1);
                currentEnd = (0, date_fns_1.addDays)(currentEnd, 1);
            }
            else if (templateData.frequency === 'weekly') {
                currentStart = (0, date_fns_1.addWeeks)(currentStart, 1);
                currentEnd = (0, date_fns_1.addWeeks)(currentEnd, 1);
            }
            else if (templateData.frequency === 'bi-weekly') {
                currentStart = (0, date_fns_1.addWeeks)(currentStart, 2);
                currentEnd = (0, date_fns_1.addWeeks)(currentEnd, 2);
            }
            else if (templateData.frequency === 'monthly') {
                currentStart = (0, date_fns_1.addMonths)(currentStart, 1);
                currentEnd = (0, date_fns_1.addMonths)(currentEnd, 1);
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
exports.onBookingConfirmed = functions.firestore.onDocumentUpdated(`${BOOKINGS_COLLECTION}/{bookingId}`, async (event) => {
    var _a, _b, _c;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!beforeData || !afterData)
        return;
    // Check if the status changed from pending to confirmed, and it is a PT booking
    if (beforeData.status === 'pending' && afterData.status === 'confirmed' && afterData.type === 'pt') {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.error('RESEND_API_KEY is not defined. Cannot send confirmation email.');
            return;
        }
        const resend = new resend_1.Resend(resendApiKey);
        try {
            // Fetch the client details
            const clientDoc = await db.collection('users').doc(afterData.userId).get();
            if (!clientDoc.exists) {
                console.error(`Client ${afterData.userId} not found`);
                return;
            }
            const clientData = clientDoc.data();
            const clientEmail = clientData === null || clientData === void 0 ? void 0 : clientData.email;
            const clientName = (clientData === null || clientData === void 0 ? void 0 : clientData.name) || 'Client';
            // Fetch the PT details
            const ptDoc = await db.collection('users').doc(afterData.ptId).get();
            const ptName = ptDoc.exists ? (_c = ptDoc.data()) === null || _c === void 0 ? void 0 : _c.name : 'Your Personal Trainer';
            if (!clientEmail) {
                console.error(`Client ${afterData.userId} has no email address`);
                return;
            }
            // Generate ICS calendar event
            const startTime = afterData.startTime.toDate();
            const endTime = afterData.endTime.toDate();
            const eventDetails = {
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
                organizer: { name: ptName, email: 'bookings@thriveapp.com' },
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
                from: 'Thrive Collective <bookings@thriveapp.com>',
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
        }
        catch (error) {
            console.error('Error sending confirmation email:', error);
        }
    }
});
//# sourceMappingURL=index.js.map