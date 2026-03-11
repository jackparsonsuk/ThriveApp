# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
