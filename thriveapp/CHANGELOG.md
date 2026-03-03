# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
