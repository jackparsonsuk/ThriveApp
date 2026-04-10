# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-04-10

### Added
- **Extended Booking Window**: Clients and trainers can now book sessions up to 6 weeks (42 days) in advance across all booking tabs (Gym, PT, Groups, Admin).
- **High-Performance Date Selector**: Implemented a smooth "slide-to-scroll" date selector using the new `useMouseDragScroll` hook, optimized for touch-precision and mouse-drag interaction without bulky scrollbars.
- **Centralized Configuration**: Moved global booking settings to `constants/config.ts` for consistent window management across the codebase.

### Fixed
- **PT Screen Type Errors**: Resolved missing state variables for client pending sessions in `pt.tsx`.

---

## [2.2.0] - 2026-04-01

### Added
- **PT Blockout Slot Grouping**: Consecutive administrative blockouts on Gym and PT calendars are now grouped into unified visual blocks with a single outline for better clarity.
- **Contextual Blockout Labels**: Blocked slots now display specific reasons (e.g., "Sarah is in the gym", "PT has a class", "You have a PT session") instead of generic labels.
- **Unified Blockout Outlines**: Enhanced UI to recognize sequential 15-minute blockout slots and apply a continuous border around the grouping.

## [2.1.1] - 2026-03-17

### Added
- **Default Gym Access**: New users are now granted gym booking access by default upon registration.

## [2.1.0] - 2026-03-13

### Added
- **Contextual Conflict Labels**: Unavailable slots on the PT tab now show specific reasons instead of a generic "Booked" — e.g. "Sarah is in the gym", "PT has a class", "You have a PT session", "Fully Booked".
- **PT Busy Indicator on Gym Tab**: When a client views the gym booking screen, slots where their assigned PT already has a booking show a "PT Busy" badge. Tapping the slot offers gym-only booking and blocks the PT session request.
- **Instructor Block Labels**: When a PT views the gym tab, their own PT sessions are labelled "PT Session with {Client}" rather than "PT Session Admin". Pending sessions include a "(Pending)" suffix.
- **PT Signup Codes**: Clients can now sign up using a PT-specific code in addition to the global signup code, automatically assigning them to that PT on registration.

### Fixed
- **Pending Bookings Ignored in Availability**: `getPTBookingsForDate` now includes pending PT sessions, so a pending request from one client correctly blocks that slot for other clients.
- **PT's Own Gym Sessions Not Blocking PT Availability**: The PT's personal confirmed and pending bookings (gym, group, etc.) are now included in the availability check, preventing clients from requesting a PT session when the PT is already in the gym.
- **Client Schedule Not Checked When PT Books**: When a PT books a session for a client, the client's existing bookings are now checked — the PT can no longer double-book a client into a slot they're already using.
- **Cancelled By Attribution**: Cancellation attribution now uses booking ownership rather than the user's role. A PT cancelling their own gym session is recorded as "client" not "pt".
- **Gym Sessions Showing Cancelled By Client**: Gym session cancellations now show a plain "Cancelled" label — the who-cancelled distinction only applies to PT and group sessions.
- **Availability Not Refreshing After Approve/Decline**: Approving or declining a PT session request now refreshes the availability slot calendar immediately, reflecting the change without a manual reload.
- **Gym Tab Not Refreshing After Navigation**: The gym tab now re-fetches availability when focused, so cancelled sessions disappear immediately when returning from the dashboard.

### Changed
- **Firestore Rules**: Clients can now read their assigned PT's bookings (by `userId` and `ptId`) to support availability checking. Users can read any booking where they are listed as the PT.
- **Pending Session Effect**: `fetchClientPendingSessions` is now in its own effect and no longer re-fires on every date change.
- **Gym Tab Availability Queries**: Replaced two separate booking fetches (`getUserBookingsForDate` + `getUserPendingBookings`) with a single `getPersonAllBookingsForDate` call, reducing redundant network requests. Combined PT availability data is now deduplicated.

---

## [2.0.1] - 2026-03-13

### Fixed
- **PT Code Assignment**: Resolved `FirebaseError: Missing or insufficient permissions` when a client entered a PT code. The Firestore read rule for the `users` collection now permits reading profiles with `role == 'admin'`, matching the `getAllPTs()` query which fetches both `pt` and `admin` roles.

### Changed
- **PT Code Entry UI**: Redesigned the client PT code entry screen with OTP-style individual character boxes, a prominent icon, larger title, and a full-width connect button.

---

## [2.0.0] - 2026-03-12

### Added
- **Membership-Based Gym Access**: Admins can toggle gym booking access per client in the Members tab. New clients default to no gym access on signup; existing users without the field default to full access.
- **PT Session Request Workflow**: Clients with a PT assigned can request a PT session from the Gym tab, creating a `pending` booking. Clients with gym access and a PT get a choice modal (gym session or PT request); clients without gym access go straight to the request flow.
- **Pending Slot Blocking**: Pending PT request slots are blocked on the client's calendar to prevent duplicate requests.
- **PT Approval Dashboard**: PTs see a "Pending Requests" section at the top of their PT tab with Approve/Decline buttons per request.
- **Dashboard Pending Requests**: Pending PT session requests appear on the client dashboard labelled "PT Session Request (Pending)" with a Withdraw button.
- **PT Tab Badge**: PT tab shows a live badge count of outstanding pending requests.
- **Enhanced Analytics**: Added Today's Snapshot, Group Sessions breakdown (by group, weekly/monthly), Peak Booking Hours bar chart, Pending PT Requests count, Membership Access progress bar, and PT Breakdown by month (for billing).

### Changed
- `Booking.status` now includes `'pending'` in addition to `'confirmed'` and `'cancelled'`.
- `UserProfile` now includes optional `canBookGym` field.
- Analytics screen redesigned with grouped sections and richer data.

---

## [1.9.0] - 2026-03-12

### Added
- **Signup Code Verification**: New required signup code field on the registration screen. Codes are validated against a global setting before account creation is allowed.
- **Announcements Banner**: Admins can now publish a dismissible announcement banner on the dashboard, visible to all users when enabled.
- **Admin Settings Tab**: New Settings tab in the admin panel for managing the global signup code and announcement banner (text and visibility toggle).
- **Settings Service**: Added `settingsService.ts` to read and write global app settings stored in Firestore (`settings` collection).

### Fixed
- **PT Profile Permissions**: Clients could not load their assigned PT's profile due to a Firestore security rules limitation. Fixed by adding an explicit rule allowing clients to read the profile of their assigned PT, and updating the client code to use a direct document fetch rather than a collection query.

---

## [1.8.2] - 2026-03-11

### Changed
- **Admin PT Privileges**: Admins are now treated as Personal Trainers throughout the app, including visibility in the Analytics breakdown, displaying in the client PT selector, and gaining access to PT-specific booking flows on the PT tab.

---

## [1.8.1] - 2026-03-11

### Changed
- **Admin Panel Access**: Restricted Personal Trainers from accessing the Analytics and Members tabs within the Admin console.

---

## [1.8.0] - 2026-03-10

### Added
- **Group Bookings**: Implemented core group bookings functionality.
- **Group Deletion**: Added capability to safely delete group bookings.

### Fixed
- **Loading Issue**: Fixed loading and rendering issues during group booking operations.

---

## [1.7.1] - 2026-03-10

### Added
- **Admin Members Tab**: New Members tab in the admin panel, displaying a list of all registered members with role-based filtering.

### Changed
- **Admin Schedule Filter**: The schedule view now filters out past time slots when viewing the current day, showing only current and upcoming slots.
- **Login Error Messages**: Login flow now provides descriptive error feedback for specific failure scenarios (e.g., incorrect password, account not found).

---

## [1.7.0] - 2026-03-10

### Added
- **Analytics Page**: New dashboard for admins to track daily/weekly bookings, PT sessions, and cancellations.
- **Robust Error Logging**: Implemented system-wide error logging to Firebase, including stack traces and user context for easier debugging.

### Changed
- **Dynamic Changelog**: Improved the changelog display to use markdown rendering for better readability and ensured it updates dynamically.

---

## [1.6.0] - 2026-03-10

### Added
- **Recurring Bookings**: PTs can now set up recurring weekly, bi-weekly, or monthly sessions for clients.
- **Automated Session Generation**: Implemented a daily cron job (Cloud Function) that automatically generates future booking instances for active recurring templates.

### Changed
- **Backend Infrastructure**: Upgraded Cloud Functions runtime to Node.js 22 and migrated to the Firebase Blaze plan for reliable automated task execution.

---

## [1.5.0] - 2026-03-10

### Security
- **Firebase API Keys**: Secured Firebase configuration by moving API keys to explicitly typed environment variables to resolve GitHub leak alerts.

---

## [1.4.0] - 2026-03-09

### Added
- **Apple Design Language**: Comprehensive UI redesign using semantic colors, unified variables, and dynamic Light/Dark mode transitions.
- **Copy PT Code**: Added a clipboard copy button next to the Trainer Code on the PT Booking screen for easier sharing.

### Changed
- **Navigation & Layouts**: Refactored application Navigation Bars to use native-feeling themes.
- **Booking Screens**: Upgraded Gym and PT booking slots from basic grids to Apple-styled vertical grouped lists.
- **Forms & Profiles**: Redesigned all authentication forms, admin screens, and the profile tab with modernized card inputs, pill-shaped buttons, and rounded radiuses.

---

## [1.3.0] - 2026-03-03

### Added
- **PT-Client Dual Role Support**: Personal Trainers can now also be clients of other PTs.
    - Updated PT tab to handle dual roles, ensuring seamless transition between trainer and client views.
    - Added validation to prevent self-assignment and improved booking display for dual-role users.
- **Improved Booking Visibility**: Refined booking logic to ensure all relevant sessions are displayed correctly for PTs who are also clients.

---

## [1.2.1] - 2026-03-03

### Added
- **Browser Page Titles**: Added descriptive titles across all pages for improved SEO and browser navigation.

### Fixed
- **Dashboard Refresh Issue**: New bookings now appear immediately on the dashboard without requiring a manual refresh.
- **Profile Page Styling**: Corrected the background color of the profile page to match the app's charcoal theme.

---

## [1.2.0] - 2026-03-03

### Added
- **PT-Initiated Client Bookings**: Personal Trainers can now book sessions for their connected clients directly from the **PT** tab.
- **Enhanced Dashboard (Home)**:
    - PTs can now see their upcoming instructional sessions on their dashboard.
    - Instructional sessions are clearly labeled (e.g., "PT Session with John Doe").
- **App Version Display**: Added a visible version number ("Version 1.2.0") to the bottom of the **Profile** screen for easy identification.
- **Double-Booking Prevention**:
    - Implemented a system-wide check to prevent users from booking overlapping sessions.
    - When a slot is blocked by an existing booking, the UI now displays the specific conflict (e.g., "PT Session", "Gym Session") instead of just "Full".
- **Backend Service Helpers**: Added `getPTBookingsForInstructor` and `getUserBookingsForDate` to `bookingService.ts`.

### Changed
- **PT Tab User Experience**:
    - Clients now see their assigned trainer's name and a message that bookings are managed by the trainer, instead of a booking calendar.
    - PTs see a "Book Session" button for each client in their list.
- **Gym Availability UI**: Conflicting slots now hide the attendee count (e.g., "0/4 booked") and show the conflict description for a cleaner look.

### Removed
- **Groups Tab**: Completely removed the "Groups" feature from bottom navigation and deleted the associated code.
- **Profile Cleanup**: Removed the "Client Management" section from the Profile tab to streamline the user experience.

---

## [1.1.0] - 2026-03-02

### Added
- **Admin Schedule Tab**: Visibility for PT/Admin roles to see all bookings per slot and block out times.
- **Attendee Tracking**: Displaying number of attendees per gym slot.

### Changed
- **About Page**: Updated content and professional background for Tom.

---

## [1.0.0] - 2026-02-27

### Added
- **Initial Release**: Basic gym and PT booking functionality.
- **Landing Page**: Modernized landing page with updated copy and animations.
