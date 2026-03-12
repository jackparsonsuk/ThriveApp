# Changelog

All notable changes to ThriveApp are documented here.

## [2.0.0] - 2026-03-12

### Added

#### Membership-Based Gym Access
- Admins can now toggle gym booking access per client in the Members tab
- New clients default to no gym access (`canBookGym: false`) on signup
- Existing users without the field default to full access for backwards compatibility

#### PT Session Request Workflow
- Clients with a PT assigned can request a PT session directly from the Gym tab
- Requests create a `pending` booking visible to the PT for review
- Clients with gym access and a PT assigned get a choice modal: book gym session or request PT session
- Clients with no gym access and a PT assigned go straight to the PT request flow
- Pending slots are blocked on the client's calendar to prevent duplicate requests

#### PT Approval Dashboard
- PTs see a "Pending Requests" section at the top of their PT tab
- Each request shows client name, date/time, and Approve/Decline buttons
- Approving a request confirms the booking and adds it to both the PT's and client's dashboards
- Declining a request cancels it

#### Dashboard Updates
- Pending PT requests show on the client dashboard labelled "PT Session Request (Pending)"
- Clients can withdraw a pending request directly from the dashboard
- PT tab shows a badge count for outstanding pending requests

#### Enhanced Analytics
- Today's Snapshot: total, gym, PT sessions and cancellations
- Weekly overview: same four metrics for the current week
- Group Sessions: this week, this month, active recurring plans, cancellation rate
- By Group breakdown: member count and monthly sessions per group
- Peak Booking Hours: top 3 busiest hours with colour-coded bar chart
- Pending PT Requests: highlighted row with live count
- Membership Access: clients with/without gym access and a progress bar
- PT Breakdown: per-trainer session counts for today, this week, and this month (useful for billing)

### Changed
- `Booking.status` now includes `'pending'` in addition to `'confirmed'` and `'cancelled'`
- `UserProfile` now includes optional `canBookGym` field
- Analytics screen fully redesigned with grouped sections and richer data

### Fixed
- Settings screen crash when no settings document found in Firestore
- PT and admin role bookings now correctly appear on the PT dashboard after approval

---

## [1.9.0] - 2026-02-XX

### Added
- Announcements feature for admins to broadcast messages to all users

### Fixed
- PT Load fix

---

## [1.8.0] and earlier

See git history for earlier changes.
