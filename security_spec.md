# Security Specification for TED-Company Test Platform

## Data Invariants
1. A Candidate can only see and update their own record.
2. Only Admins can create, delete, or list all candidates.
3. TestType templates are read-only for Candidates, read-write for Admins.
4. Admins are identified by existence in the `/admins` collection.

## The Dirty Dozen Payloads (Rejects)
1. Unauthenticated user trying to read any candidate.
2. Candidate A trying to read Candidate B's results.
3. Candidate trying to delete their own record.
4. Candidate trying to modify their score directly.
5. Candidate trying to create a new TestType template.
6. User trying to inject a 1MB string into a candidate's name.
7. Candidate trying to change their email to an admin email.
8. Authentication without email verification (if mandated).
9. Modifying `createdAt` field (if we add it).
10. Adding a shadow field `isAdmin: true` to a candidate record.
11. Reading the entire `/candidates` collection as a non-admin.
12. Updating status to 'completed' without fulfilling module requirements (logic check).

## The Test Runner (Mock representation)
A test suite will verify:
- `get /candidates/self` -> ALLOW for self
- `get /candidates/other` -> DENY for non-admin
- `list /candidates` -> ALLOW for admin, DENY for candidate
- `write /testTypes/123` -> DENY for candidate
