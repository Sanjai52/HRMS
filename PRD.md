# Scalable Human Resource Management System (HRMS)

**Project:** UCS3513 System Design Laboratory – Mini Project 6  
**Academic Year:** 2026–27  
**Institution:** SSN College of Engineering  
**Project Type:** Scalable full-stack HRMS prototype and system-design evaluation
**PRD Version:** 2.5 — monotonic registry deadlines, routed seed exceptions and safe pre-copy abort
**Status:** Proposed implementation baseline for independent product/architecture review; implementation results must be measured, never invented

**Revision summary (v2.5):** retains the v2.4 Phase 1a dependency order and fenced `ShardRouter` boundary, and clarifies monotonic-clock registry deadlines, routing requirements for seed/migration exceptions, independent registry/ID-lease outage bounds, safe pre-copy gate recovery, and the local-only/no-rate-limiter Phase 1a login. Fence overhead remains a required measured evaluation. The v2.3 catalog-outage, audit-atomicity, configuration and data-ownership corrections remain in force. The design remains local-first and uses a controlled global write pause rather than online dual-write migration; it does not claim zero-downtime production rebalancing.

---

## 1. Product Overview

The Scalable Human Resource Management System (HRMS) is an enterprise-style web application for managing employees and core HR operations through a unified platform.

The system will support:

- Employee registration and authentication
- Employee profile management
- Employee search
- Attendance tracking
- Leave management
- Payroll processing
- Recruitment and job openings
- Candidate management
- Candidate sourcing through a simulated external candidate portal
- Performance management and tracking
- HR notifications
- Reports and operational monitoring

The application is intentionally designed as more than a conventional CRUD HR portal. Its primary system-design objective is to demonstrate how the HRMS can remain efficient and reliable as the number of employees, attendance records, leave requests, payroll transactions, recruitment records, and concurrent users increases.

The project will integrate the eight system-design components specified by the assignment:

1. Rate Limiter
2. Sharding
3. Consistent Hashing
4. Key-Value Store
5. Unique ID Generator
6. URL Shortener
7. Web Crawler
8. Autocomplete

The components will be integrated into actual HR workflows rather than implemented as isolated demonstrations.

---

## 2. Problem Statement

Traditional small HR applications can begin as a single application with one database and synchronous request processing. As the organization grows, this architecture can experience:

- Increasing database load
- Slow employee and candidate searches
- Contention on frequently accessed records
- High request volumes on authentication and public endpoints
- Long-running payroll operations
- Large attendance and recruitment datasets
- Uneven distribution of data or server traffic
- Increased concurrent-user load
- Failures caused by individual application instances
- Difficulty scaling background operations independently from user-facing APIs

The proposed HRMS addresses these concerns using application-level sharding, distributed request/key assignment, caching and key-value storage, rate limiting, asynchronous background processing, scalable search assistance, URL shortening, unique ID generation, and web crawling.

---

## 3. Product Goals

### 3.1 Primary Goals

1. Build a complete working HRMS covering the required HR workflows.
2. Integrate all eight prescribed system-design components into meaningful workflows.
3. Demonstrate application-level database sharding across multiple PostgreSQL shards.
4. Demonstrate horizontal API scaling behind a local NGINX load balancer.
5. Provide role-based experiences for employees, managers, HR personnel, and administrators.
6. Support asynchronous processing for long-running or bulk operations.
7. Provide quantitative performance evaluation at low, medium, and high workload levels.
8. Demonstrate at least one scalability or failure scenario.
9. Make the application local-first so the complete system can run without AWS.
10. Keep the architecture portable so the same business logic can later be deployed to AWS with infrastructure adapters rather than a major rewrite.

### 3.2 Secondary Goals

- Provide a premium enterprise HR interface.
- Keep navigation simple through a collapsible authenticated sidebar.
- Provide responsive search and autocomplete experiences.
- Provide operational dashboards and observability.
- Make system-design decisions measurable and explainable in the final report.

---

## 4. Non-Goals

The following are outside the initial scope unless explicitly added later:

- Real banking or payment integration for payroll disbursement
- Direct scraping of LinkedIn or other platforms that prohibit automated scraping
- Real government payroll/tax filing integrations
- Real biometric hardware integration
- Full accounting/ERP functionality
- Mobile-native applications
- Kubernetes deployment
- Kafka-based event streaming in the initial implementation
- A separate microservice for every HR domain
- Production-grade multi-region disaster recovery
- Real-world employee identity verification

The crawler will use a **simulated external candidate portal**, which is consistent with the assignment's allowance for simulated external recruitment sources.

---

## 5. Target Users and Roles

The system will support four primary authenticated roles.

### 5.1 Employee

Employees can:

- View and update permitted profile information
- View attendance
- Check in and check out
- View attendance history
- Apply for leave
- Track leave requests and balances
- View payroll information and payslips
- View performance information
- View notifications

### 5.2 Manager

Managers can perform employee-level activities plus team management:

- View assigned team members
- View team attendance
- Review leave requests
- Approve/reject applicable leave requests
- View team performance
- Conduct performance reviews
- View team reports

### 5.3 HR

HR has the primary operational role:

- Manage employees
- Search employees
- Manage attendance
- Manage leave
- Manage payroll
- Create and manage job openings
- Manage applications and candidates
- Source candidates through the crawler
- Manage recruitment stages
- Manage performance processes
- Send/view HR notifications
- View operational reports

### 5.4 Administrator

Administrators manage organization-wide configuration and system access:

- Manage users and roles
- Configure departments and organization settings
- Manage HR policies
- Manage system settings
- View system health and operational metrics
- Access all HR functionality where authorized

Authorization is enforced by backend RBAC middleware. Hiding a sidebar item is only a UI convenience and is not considered security.

---

# 6. Information Architecture and Pages

## 6.1 Public Pages

### Landing Page `/`

Purpose:

- Introduce the HRMS
- Explain major capabilities
- Provide login and registration entry points

Navigation:

- Logo
- Features
- About
- Contact
- Login
- Sign Up

The public area uses a top navigation bar.

### Login `/login`

Fields:

- Email
- Password
- Remember session

Actions:

- Login
- Forgot password
- Optional Google sign-in extension

From Phase 2 onward, the login endpoint is protected by the rate limiter. The Phase 1a seeded-login slice is a local-only exception and must not be exposed on a public/shared network.

### Account setup `/register`

This route is invitation acceptance/account activation, not unrestricted public employee creation. HR/admin first creates an employee invitation or pending account. The invitee supplies/sets:

- Name and verified/invited email
- Password
- Phone and required profile fields
- Single-use, time-limited invitation token

The backend validates the invitation, reserves the normalized email in the global catalog, creates/activates the employee through the ShardRouter and generates the internal ID. Public users cannot choose their role.

### Forgot Password `/forgot-password`

Supports password recovery through a secure token/session workflow.

---

## 6.2 Authenticated Application Shell

After authentication, the interface switches from a public top navbar to an enterprise application shell.

### Top Bar

Contains:

- HRMS logo
- Global search
- Notifications
- Help/support entry
- User profile menu

### Collapsible Sidebar

Expanded navigation:

- Dashboard
- Employees
- Attendance
- Leave
- Payroll
- Recruitment
- Performance
- Reports
- Settings

The sidebar collapses to icon-only mode on desktop and becomes a drawer on smaller screens.

Navigation is role-aware.

---

## 6.3 Employee Pages

### Employee Dashboard `/dashboard`

Displays:

- Today's attendance
- Attendance summary
- Leave balance
- Pending leave requests
- Latest payslip
- Performance status
- Recent notifications

### My Profile `/profile`

Displays:

- Personal details
- Contact details
- Job information
- Department
- Designation
- Joining date
- Emergency contact
- Profile image

Editable fields depend on role and permission.

### My Attendance `/attendance`

Displays:

- Current attendance status
- Check-in/out actions
- Monthly calendar
- Present/absent/late counts
- Attendance history

### My Leave `/leave`

Displays:

- Leave balances
- Pending requests
- Approved requests
- Rejected requests
- Leave history

### Apply Leave `/leave/apply`

Fields:

- Leave type
- Start date
- End date
- Reason
- Optional attachment

### My Payroll `/payroll`

Displays:

- Current payroll status
- Salary information
- Payroll history
- Payslip links

### Payslip `/payroll/payslips/:payslipId`

Displays:

- Employee information
- Earnings
- Deductions
- Net salary
- Payroll period

### My Performance `/performance`

Displays:

- Goals
- KPIs
- Review status
- Manager feedback
- Ratings
- Previous review history

### Notifications `/notifications`

Displays in-app HR notifications and their status.

---

## 6.4 Manager Pages

### My Team `/manager/team`

Provides:

- Team directory
- Employee status
- Attendance status
- Search/filtering

### Team Member `/manager/team/:id`

Provides authorized access to:

- Employee details
- Attendance
- Leave history
- Performance

### Leave Approvals `/manager/leave`

Provides:

- Pending leave requests
- Approve action
- Reject action
- Request details

### Team Performance `/manager/performance`

Provides:

- Goal status
- Review completion
- Employee ratings
- Team performance overview

### Performance Review `/manager/performance/:employeeId`

Allows managers to:

- Review goals
- Add feedback
- Assign ratings
- Submit review

---

## 6.5 HR Pages

### HR Dashboard `/hr/dashboard`

Displays:

- Total employees
- Attendance summary
- Leave summary
- Open jobs
- Application count
- Recruitment pipeline
- Payroll status
- Recent HR activity

### Employee Directory `/hr/employees`

Features:

- Search
- Autocomplete suggestions
- Department filter
- Status filter
- Pagination
- Employee details
- Add employee

### Add Employee `/hr/employees/new`

Captures:

- Personal information
- Contact information
- Job information
- Department
- Designation
- Joining date
- Documents
- Role

The invitation/reservation payload must not contain salary, payroll amounts or salary structures. Salary setup is a separate authorized action performed only after the employee row has been created on its authoritative employee shard; the salary structure is written to that shard, never to `pg-catalog` or the invitation record.

### Employee Details `/hr/employees/:id`

Tabs:

- Overview
- Attendance
- Leave
- Payroll
- Performance
- Documents

### Edit Employee `/hr/employees/:id/edit`

Allows authorized HR/admin users to update employee data.

---

## 6.6 HR Attendance Pages

### Attendance Management `/hr/attendance`

Features:

- Daily attendance table
- Employee search
- Department filter
- Date filter
- Status filter
- Check-in/out records
- Attendance corrections for authorized users

### Attendance Reports `/hr/attendance/reports`

Provides:

- Daily report
- Weekly report
- Monthly report
- Department-wise report

---

## 6.7 HR Leave Pages

### Leave Management `/hr/leave`

Features:

- Pending requests
- Approved requests
- Rejected requests
- Employee search
- Leave filtering
- Approval/rejection workflow

### Leave Policies `/hr/leave/policies`

Admin/HR configuration for leave categories and applicable policies.

---

## 6.8 HR Payroll Pages

### Payroll Dashboard `/hr/payroll`

Displays:

- Payroll period
- Total employees
- Payroll amount
- Processed count
- Pending count
- Failed count

### Run Payroll `/hr/payroll/run`

Allows HR to create a payroll processing job.

The API should enqueue payroll work rather than processing a large employee population synchronously.

### Payroll History `/hr/payroll/history`

Displays historical payroll batches and processing status.

### Payroll Batch `/hr/payroll/batches/:batchId`

Displays:

- Batch metadata
- Employee count
- Success/failure status
- Processing duration
- Individual payroll records

---

## 6.9 Recruitment Pages

### Recruitment Dashboard `/hr/recruitment`

Displays:

- Open jobs
- Applications
- Shortlisted candidates
- Interviews
- Selected candidates
- Recruitment pipeline

### Job Openings `/hr/recruitment/jobs`

Displays:

- Job title
- Department
- Status
- Application count
- Creation date
- Closing date

### Create Job `/hr/recruitment/jobs/new`

Fields:

- Job title
- Department
- Description
- Required skills
- Experience requirement
- Location
- Employment type
- Salary range
- Application deadline

The system creates a canonical public job/application URL and a shortened URL through the required URL shortener. Short links must resolve to approved public routes only. Candidate status URLs use separate high-entropy, expiring/revocable status tokens and must not expose internal candidate/application IDs.

### Applications `/hr/recruitment/applications`

Displays:

- Candidate
- Job
- Application status
- Current recruitment stage
- Source
- Applied date

### Application Details `/hr/recruitment/applications/:id`

Displays:

- Candidate details
- Resume
- Skills
- Application information
- Stage history
- Recruiter notes
- Assessment status
- Interview status

Pipeline:

`APPLIED → SCREENING → SHORTLISTED → ASSESSMENT → INTERVIEW → SELECTED`, with `REJECTED` and `WITHDRAWN` terminal states; Technical 1, Technical 2 and Behavioral/HR are interview-round records under `INTERVIEW`.

### Candidate Pool `/hr/recruitment/candidates`

Candidate records may originate from:

1. Direct applications
2. Simulated external candidate portal sourcing

### Candidate Details `/hr/recruitment/candidates/:id`

Displays:

- Candidate profile
- Skills
- Experience
- Resume
- Source
- Applications
- Notes
- Current status

### Candidate Sourcing `/hr/recruitment/sourcing`

Allows HR to define a target role/skills and trigger candidate discovery through the crawler.

Displays:

- Source
- Crawl status
- Pages processed
- Candidates discovered
- Candidates imported
- Crawl errors

---

## 6.10 Performance Pages

### Performance Dashboard `/hr/performance`

Displays:

- Review completion
- Performance distribution
- Pending reviews
- Goal completion

### Review Cycles `/hr/performance/cycles`

Allows HR to create and manage performance review periods.

### Performance Review `/hr/performance/:employeeId`

Displays:

- Goals
- KPIs
- Achievements
- Manager comments
- Employee comments where applicable
- Rating
- Review status

---

## 6.11 Reports `/hr/reports`

Reports include:

- Employee reports
- Attendance reports
- Leave reports
- Payroll reports
- Recruitment reports
- Performance reports
- System performance reports

System-design metrics may include:

- Average response time
- Throughput
- Success/error rate
- Resource usage
- Rate-limit rejection rate
- Shard distribution
- Server load distribution
- Key-value lookup latency
- ID generation rate
- ID collision count
- URL redirection latency
- Crawler throughput
- Autocomplete response time and accuracy

---

## 6.12 Settings

### General Settings

- Organization profile
- Departments
- Designations
- Preferences

### Security

- Password/security settings
- Session management
- Role/permission configuration

### Notifications

- Email notification preferences
- In-app notification preferences

### Admin Settings

- Roles
- Permissions
- Leave policies
- Payroll configuration
- System configuration

---

## Public recruitment routes (no authenticated HR sidebar)

- `/jobs` — searchable public list of published/open jobs.
- `/jobs/:slug` — job detail, required skills, location/type, deadline and apply CTA.
- `/jobs/:jobId/apply` — candidate application form and resume upload.
- `/s/:code` — short URL redirect to an approved canonical job/application URL.
- `/application-status/:token` — limited application status view using a high-entropy, revocable token; never expose another candidate's record by sequential ID. Rate-limit this endpoint and `/s/:code` to limit token/code enumeration.

## Additional HR/Admin pages

- `/hr/recruitment/sourcing` — create a role/skills sourcing request, start crawler, view crawl status/results.
- `/admin/users` and `/admin/roles` — user activation, invitations and role assignment.
- `/admin/audit-logs` — restricted audit search.
- `/admin/system-health` — protected system status and links/embedded view to Grafana. Business reports remain separate from system monitoring.
- `/admin/shards` — Admin-only, audited shard registry and add-shard preview/control page. It may register only preconfigured shard IDs/endpoints; the browser cannot supply arbitrary database URLs or credentials.

# 7. Functional Requirements

## FR-01 Employee Registration

The system shall support HR/admin-created invitations and employee account activation. Unrestricted self-registration is not enabled by default. The system shall:

- Validate the single-use, time-limited invitation and required fields.
- Prevent duplicate normalized emails through the global catalog unique constraint, including concurrent attempts.
- Hash passwords securely using Argon2id.
- Use `employee_id` as a UUID and generate a separate human-readable employee display number. Snowflake-style IDs are reserved for operational records such as attendance, payroll, audit and workflow events.
- Model activation as `INVITED → RESERVED → CREATED → ACTIVE`; the invitation ID is the idempotency key. The catalog reservation has an expiry recorded in `docs/decisions.md`. A retry of the same invitation must resolve to the same employee, and a reconciliation job must complete or release stale `RESERVED`/`CREATED` entries after checking authoritative shard state.
- Apply rate limiting to invitation acceptance and account setup.
- Store employee information in the appropriate shard and assign only the role authorized by the invitation creator.

## FR-02 Authentication

The system shall support:

- Login
- Logout
- Session/refresh-token management
- Password recovery
- Role identification

Authentication shall use application-owned credentials rather than requiring Supabase as an authentication provider.

Redis will store session/refresh-token state where appropriate.

## FR-03 Authorization

The system shall enforce role-based authorization for:

- Employee
- Manager
- HR
- Admin

Every protected backend endpoint must verify authentication and authorization. Shard registration, migration preview/cutover, directory rebuild and other control-plane actions are Admin-only and audited.

## FR-04 Employee Profile Management

Authorized users shall be able to create, view, and update employee profile information.

Employee profile data shall be routed through the shard router. Employee create/update/deactivate transactions write an outbox event in the same transaction on the owning shard; an idempotent worker projects the change to `pg-catalog` directory metadata and refreshes/invalidates autocomplete. PostgreSQL shard data remains authoritative; the directory and autocomplete are derived projections.

Frequently accessed data may be cached using the key-value store.

## FR-05 Employee Search

HR and authorized users shall be able to search employees by relevant fields such as:

- Employee ID
- Name
- Email
- Department
- Designation
- Skills where applicable

Autocomplete shall provide fast suggestions while PostgreSQL remains the authoritative source for full search results.

## FR-06 Attendance

The system shall support:

- Check-in
- Check-out
- Attendance history
- Daily status
- Monthly summaries
- HR attendance management
- Attendance reporting

Attendance records are routed by owning `employee_id` through the stable bucket and versioned consistent-hash ring; they are co-located with the owning employee record.

## FR-07 Leave Management

The system shall support:

- Leave balances
- Leave application
- Leave approval
- Leave rejection
- Leave history
- Leave policy configuration
- Notifications for leave status changes

## FR-08 Payroll

The system shall support:

- Payroll period creation
- Payroll calculation/processing
- Payroll batch tracking
- Payroll history
- Payslip generation/storage
- Employee payroll viewing

Large payroll operations shall be asynchronous.

## FR-09 Recruitment

HR shall be able to:

- Create job openings
- Edit job openings
- Close job openings
- Publish job application links
- View applications
- Move applications through recruitment stages
- Record interview/assessment information
- Select or reject candidates

## FR-10 Candidate Management

The system shall maintain candidate records separately from employee records.

A candidate becomes an employee only after the candidate is selected and the HR onboarding/registration process is completed.

Candidate profiles and applications are routed by `candidate_id` through the recruitment routing domain; job postings remain in `pg-catalog`, and global candidate identity claims are unique by normalized email.

## FR-11 Candidate Sourcing

The system shall support candidate sourcing through a simulated external candidate portal.

The crawler shall:

1. Receive role/skill requirements.
2. Access the simulated portal through HTTP.
3. Extract candidate information.
4. Normalize candidate data.
5. Deduplicate where possible.
6. Store/import candidate records into the HRMS.
7. Report crawl metrics and failures.

The crawler shall not directly read the HRMS database of the external portal.

## FR-12 Performance Management

The system shall support:

- Goals
- KPIs
- Review cycles
- Manager feedback
- Ratings
- Performance history
- Review status

Manager access is limited to assigned team members; HR/admin may view organization-wide reviews. Employees may view their own released reviews.

## FR-13 Notifications

The system shall support notifications for events such as:

- Leave approval/rejection
- Payroll completion
- Performance review availability
- Recruitment updates where appropriate
- HR announcements

Notifications shall be processed asynchronously where appropriate.

---

# 8. System-Design Component Mapping

The assignment lists eight components and requires us to justify their mapping to HR workflows. The mapping below is a **design decision**, not a claim that the assignment mandates this exact implementation.

| Component | Primary integration | Why it belongs | Evidence to collect |
|---|---|---|---|
| Rate limiter | Login, password recovery, public job/application APIs, search and crawler-trigger APIs | Protect expensive/sensitive endpoints and bound request rates | Allowed/rejected requests, rejection rate, latency, behavior when Redis is unavailable |
| Sharding | Employee-owned operational records; recruitment records use their own routing domain | Distribute records and workload across physical PostgreSQL instances | Per-shard row/query distribution, latency, skew, routing correctness |
| Consistent hashing | ShardRouter bucket-to-physical-shard placement | Keep bucket ownership stable and limit remapping when a shard is added/removed | Deterministic mapping, bucket/row distribution, remapping fraction versus modulo |
| Key-value store | Redis for session metadata, rate-limit state, cache, autocomplete and temporary state | Fast key-based lookups | GET/SET latency, hit rate, memory, behavior on cache loss |
| Unique ID generator | Employee, attendance, payroll, candidate, job, application and audit identifiers | Generate identifiers across API replicas without a central database sequence bottleneck | IDs/second, latency, duplicate count, concurrent-replica test |
| URL shortener | Public job links and application links | Give recruitment a concrete redirect use case | Create/redirect latency, valid/invalid redirect behavior, collision handling |
| Web crawler | Candidate sourcing from the project-owned simulated external candidate portal | Demonstrate bounded crawling, parsing, normalization and deduplication | Pages/second, extraction success, retries, duplicates, imports |
| Autocomplete | HR/admin employee directory and public job listings; manager results are permission-filtered | Improve interactive search without treating cache as the source of truth | p50/p95/p99 latency, Top-K relevance, cache hit rate and index freshness |

**Component boundaries:** NGINX/ALB distribute HTTP requests across API replicas. The ShardRouter uses a fixed number of stable logical buckets and a versioned consistent-hash ring to map each bucket to a physical PostgreSQL shard. These are different responsibilities. The ring is exercised by real employee-owned database placement and the shard-add experiment; it is not a second HTTP load balancer and is not assigned to crawler scheduling. Synthetic keys may supplement, but cannot replace, the integrated database-placement experiment.

## 8.1 Priority tiers

- **P0 — core product and required foundations:** public landing/login/account setup shell, authentication/RBAC, employee lifecycle and management, search, attendance, leave, simplified payroll, recruitment/candidates, performance reviews, notifications/announcements, admin settings and audit access at a minimal usable level, sharding, ID generation, rate limiting, KV store, autocomplete, migrations, basic observability and tests. Advanced analytics are not P0.
- **P1 — required system-design demonstration and integration:** verified shard-add migration using the consistent-hash ring, URL shortener, crawler, asynchronous workers, outbox-driven indexing/notifications, NGINX replicas, k6 workload tests, and selected failure/scalability experiments.
- **P2 — deployment and polish:** AWS deployment, advanced reports/settings, optional Firecrawl provider, expanded dashboards and nonessential UI polish. P2 must not delay a complete local demonstration.

A P1 component is still required for assignment completion; the tier indicates sequencing, not permission to omit it.

---

# 9. Detailed System-Design Components

## 9.1 Rate Limiter

**Decision:** beginning in Phase 2, implement a Redis-backed token-bucket limiter with atomic state updates (Redis Lua or an equivalent atomic operation). Limits are configuration-driven and scoped by endpoint class and authenticated identity/IP as appropriate. Phase 1a is a local-only walking skeleton and has no rate limiter: its seeded login must not be exposed as a public or shared-network service. Redis is introduced in Phase 1b, and the limiter is implemented in Phase 2.

- Apply stricter limits to login, password recovery and account setup; separate limits for public application endpoints, search and crawler initiation.
- Configure Express `trust proxy` narrowly for the known NGINX hop. Never trust arbitrary client-supplied forwarding headers.
- Return HTTP `429` with a useful retry indication when a limit is exceeded.
- k6 test traffic must use an explicit test-only bypass/allowlist configuration or dedicated test identity. The bypass must be disabled by default and impossible to activate accidentally in a production deployment.
- **Failure policy:** fail closed for login, password recovery, invitation acceptance and account setup. Employee search and public job browsing may fail open during a Redis outage while emitting a metric. Public application submission, `/s/:code`, and `/application-status/:token` use a bounded conservative fallback or fail closed; the selected behavior must be explicit and tested. Do not let an outage silently reset sensitive endpoint limits.

Measure allowed/rejected count, rejection percentage, endpoint latency, and behavior under Redis failure.

## 9.2 Sharding and ShardRouter

**Decision:** use three active physical PostgreSQL shard containers locally plus one pre-provisioned standby (`shard-4`) for the add-shard demonstration, and a separate `pg-catalog` PostgreSQL service for global identity/directory/control metadata. `pg-catalog` is not a business shard and is included in Compose, migrations, connection-budget calculations and failure tests. Every employee-owned data access goes through the shared `ShardRouter`; domain services must not select shard pools independently.

### Entity placement and shard keys

- **Employee-owned records:** `employee_id` is a stable UUID. The stable bucket is `bucket_id = SHA256(lowercase-hyphenated-UUID UTF-8)[first 4 bytes as unsigned big-endian] mod 256`. Each employee-owned table has `employee_id` and `bucket_id NOT NULL` with an index. Child records route through the owning employee, not their own generated ID. The bucket count is fixed at 256 for v1.
- **Recruitment:** candidate profiles and applications route by `candidate_id` through the separate `candidate-v1` routing-map version and the same ring implementation with a domain namespace. Candidate-owned tables use `candidate_id` and `candidate_bucket_id NOT NULL` with an index; `candidate_bucket_id` is computed with the same stable hash/modulo rule but is resolved through the separate candidate map. In v1, candidate-domain buckets remain pinned to shards 1–3; the employee-domain standby `shard-4` is not a candidate destination. Candidate rebalancing is future work. Job postings and global recruitment configuration live in `pg-catalog`. Job-specific applicant lists use bounded scatter-gather across candidate shards.
- **Global catalog:** `pg-catalog` stores identity credentials/claims and invitations, roles, directory/search projections, departments/designations/leave policies/holidays, jobs and global recruitment metadata, short URL mappings, payroll-batch status, durable worker-ID leases, process registrations, shard membership and routing-map versions, migration state, and global audit records. It does not store authoritative employee profiles, attendance, leave, payroll employee-period records or performance records.
- **Global uniqueness:** normalized email identity claims are enforced in `pg-catalog` before employee activation. Candidate normalized-email claims are separately unique in `pg-catalog`. Do not assume a uniqueness constraint on separate shards enforces global uniqueness.

### Shard-local versus cross-shard operations

- Profile, attendance, leave, payroll employee-period and performance reads/writes route to the owning shard using `employee_id → bucket_id → active routing map`.
- Employee directory/search uses the catalog projection, with bounded scatter-gather only where full authoritative detail is required. Manager-team lists and organization reports use the catalog or bounded scatter-gather/precomputed aggregates and must identify partial results.
- Scatter-gather is bounded by query timeout, connection timeout, page/row limit and concurrency limit. A shard outage must never cause a write to be routed to another shard as fallback.
- Do not rely on cross-shard SQL joins or cross-shard foreign keys. Enforce relationships in service logic and idempotent workflows.
- `ShardRouter` exposes an owned-bucket filter/helper for scatter-gather queries and per-shard distribution metrics. Retained source copies must be excluded unless their bucket is owned by that shard in the active routing map.

### Stable bucket mapping and routing-map materialization

1. Normalize UUID input to the lowercase hyphenated string form and encode as UTF-8. Compute SHA-256; read the first four bytes as an unsigned big-endian integer; apply modulo 256. Golden UUID-to-bucket test vectors are checked into CI.
2. The ring point for virtual node `i` of shard `shardId` is `SHA256(UTF-8(shardId + ":" + i))`. A bucket's ring position is `SHA256(UTF-8("bucket:" + bucket_id))`; the owner is the first virtual node clockwise. Virtual-node count `V` is a configuration value recorded in `docs/decisions.md`; virtual-node names and positions are independent of other ring members.
3. `pg-catalog` stores versioned routing maps as `routing_map_versions` plus a materialized 256-row `routing_map_buckets` mapping for each employee routing version. The ring generates the candidate map; runtime lookups use a loaded, validated map version. A cutover changes the active-version pointer atomically only after copy and verification.
4. Candidate routing uses a separate `candidate-v1` map and namespace. Do not route candidate tables through the employee map or silently move candidates to `shard-4`.
5. The CI test asserts that each materialized map exactly matches the ring output for that version and that all API/worker implementations agree. Do not claim that 256 buckets guarantee even row distribution; report bucket and row skew.

### Shard provisioning and admin control plane

The website never creates Docker containers or cloud infrastructure. Locally, Compose starts `shard-4` as a pre-provisioned `STANDBY`; in AWS, an operator provisions the endpoint. The Admin-only `/admin/shards` page/API may register only a shard ID and endpoint from server-side configuration. Reject arbitrary endpoint URLs from clients to prevent SSRF and credential exposure. Registration, preview, migration, cutover and failure actions are audited.

### V1 migration protocol (controlled global write pause; not zero-downtime)

Migration state is durable and auditable: `PREVIEWED → PREPARING → GATED → COPYING → VERIFYING → VERIFIED_GATED → CUTOVER_COMMITTED → ACKED → WRITES_RESUMED → COMPLETED`, with `ABORTED` and `FAILED` paths. Only one migration may run at a time.

1. **Preview:** calculate the candidate ring/map version, moved buckets, source/destination shards, estimated rows and expected remapping. The active map is unchanged.
2. **Prepare:** verify destination schema version/connectivity; validate the ownership manifest; drain relevant background jobs and outbox events; reject new migration starts while another is active.
3. **Close the write gate and drain:** all state-changing API, worker and outbox-dispatcher writes must pass through the shared write-gate contract. Shard-owned writes use the `ShardRouter` per-shard fence; catalog-owned writes check the durable catalog gate in their same catalog transaction. A durable process registry in `pg-catalog` records `owner`, `kind` (`API`, `WORKER`, `OUTBOX_DISPATCHER`), `heartbeat_at`, `expires_at`, `map_version_loaded` and `gate_epoch_ack`. Every process must register before it becomes ready to write. **Registry validity is evaluated locally from the last successful catalog heartbeat:** the process computes a conservative deadline using its local monotonic clock, anchored at the heartbeat request send time plus the configured TTL and reduced by the safety margin; it must not derive the deadline from the catalog wall-clock `expires_at`. If it cannot renew before that local deadline, it fails writes closed. A process with no valid locally held registration cannot write, and a new process that cannot register remains unready. Ordinary business writes do not query `pg-catalog` synchronously just to validate registry status. Instead, each shard has a durable `shard_write_gate` state. Every authoritative write transaction acquires a transaction-scoped shared fence on its target shard and checks that shard's gate state in the same transaction before mutating data. The migrator first closes the durable catalog business-write gate in `pg-catalog`; catalog-owned business/control mutations check that gate in their same catalog transaction (and naturally fail if the catalog is unavailable). It then acquires exclusive fences on every active source and destination shard in deterministic order, thereby draining in-flight writes; while holding them it durably marks all involved shard gates `GATED` for the same epoch and records the migration epoch in `pg-catalog`. During this preparation interval, a shard whose local marker is not yet set may still accept a write, but copy is forbidden until every marker is set and every such in-flight write has drained; those writes remain on the old map and are included in the subsequent copy. If any shard cannot be fenced or marked, copying does not start. If the migrator is still alive and no copy has begun and no routing-map change has occurred, it may abort the attempt and reopen only the `shard_write_gate` markers that it set for this exact epoch, using a compare-and-set from `GATED` to `OPEN` conditioned on the matching epoch; the active map is unchanged, so writes resume only against the old authoritative map. It must release its held fences safely and record the abort. If the migrator is dead/unreachable, the epoch/state is ambiguous, any copy has begun, or any map change has occurred, keep affected gates closed and require explicit recovery; never reopen a marker belonging to another epoch. Once durable markers are set, the migrator may release the exclusive locks: subsequent writers acquire the shared fence, see `GATED`, and return `503` plus `Retry-After`. Reads continue against the old active map. Admin control-plane endpoints are exempt from the business-write gate but remain authenticated and audited.
4. **Before copy:** copy cannot begin until every unexpired registered process has acknowledged the current gate epoch, all in-flight fenced writes are drained, every source/destination shard involved has a durable `GATED` marker for that epoch, and relevant outbox events are drained. Processes check their locally valid registry deadline, last successfully observed gate epoch/state and loaded map at request/job start; the per-shard fence and durable gate marker enforce the commit boundary, so a paused or stale writer cannot commit against an old map. Registry/gate polling alone is not the migration fence. If a process cannot be fenced or its expiry is ambiguous, abort safely rather than assuming it is stopped. Poll/heartbeat intervals and timeouts are recorded in `docs/decisions.md` before implementation.
5. **Copy:** copy every table in the canonical `docs/shard-owned-tables.md` manifest for each moved bucket, preserving IDs and relationships. Use idempotent upserts. `outbox_events` are excluded because relevant events must be drained before copy; catalog projections are excluded because they are derived/rebuilt; object-storage objects are not copied and their keys must not encode shard identity. The old shard remains authoritative.
6. **Verify:** compare per-table row counts and deterministic checksums over the manifest's specified columns; compare employee IDs/bucket IDs and validate application-level relationships. The test fixture must contain an employee with records in every applicable manifest table. Any mismatch aborts cutover and leaves the old map authoritative.
7. **Commit map and acknowledge:** while the gate remains closed, atomically set the active routing-map version in `pg-catalog`. Every unexpired process must load and acknowledge version `vN+1`; a process that cannot load/acknowledge it remains unready and cannot write. New processes register in gated state and load the active version before becoming ready.
8. **Read-only smoke tests and rollback boundary:** while writes remain gated, run read-only destination verification and smoke tests. If they fail, revert the active map pointer to vN while no post-cutover writes have been accepted, mark the migration aborted, and retain source data. Do not resume writes before this check passes.
9. **Resume:** only after every unexpired registry row acknowledges `vN+1` and read-only smoke tests pass may the gate be reopened. The first accepted post-resume write is the point of no return for a simple map rollback. After that point, a failure requires stopping writes and running a forward repair/new migration; do not silently switch back to vN.
10. **Complete and clean up:** record copy, verification, gate, cutover and resume metrics. Retain source copies until an explicit cleanup operation after validation. All steps are retryable/idempotent where safe; failed copy/verification leaves the old map authoritative. Outbox dispatch resumes and continues polling all active shards after the gate reopens.

The write-fence contract must prevent an already-started or paused stale writer from committing after gate closure/cutover; process polling alone is insufficient. The normative contract is a transaction-scoped shared fence and durable gate check on the target shard for every authoritative write, plus an exclusive fence across all involved shards while the migrator drains writes and persists `GATED` markers. The durable markers remain closed throughout copy, verification, map cutover and process acknowledgements; therefore a migrator crash or catalog outage cannot silently reopen business writes. After all unexpired processes acknowledge the new map and gated smoke tests pass, the migrator prepares to reopen the per-shard gates and then opens the catalog business-write gate. Any shard that remains durably `GATED` continues to reject writes; interrupted resume is retried through the migration control plane rather than bypassing a marker. Because all processes have acknowledged the new map and smoke tests have passed before any gate is opened, a partial gate reopen can cause temporary partial unavailability but cannot authorize a stale-map write. The per-shard fence means ordinary business writes do not need a synchronous `pg-catalog` lock/query, preserving bounded operation during a catalog outage while the local process-registration and worker-ID lease deadlines remain valid. If `pg-catalog` is unavailable during migration, do not start a new migration or declare cutover/resume complete. A live migrator may still perform only the narrowly scoped same-epoch pre-copy abort described in step 3 if it can prove no copy or map change occurred; otherwise keep durable shard gates closed until catalog recovery and explicit recovery. The concrete lock SQL and connection handling belong in the TRD.

V1 supports **adding** the pre-provisioned standby shard. Shard removal is preview/unit-test only; no production data drain/removal workflow is required. This protocol deliberately pauses all state-changing business writes. Online per-bucket gating, dual writes and change-log replay are out of scope.

Measure moved buckets, theoretical remapping fraction, actual rows/bytes copied, per-table checksums, copy/verification/gate/cutover duration, write 503 count, read success rate, per-shard row distribution and failures. Ring remapping and physical records moved are separate metrics.

## 9.3 Consistent Hashing

**Decision:** consistent hashing is the ShardRouter placement mechanism for stable logical buckets, not crawler scheduling. Hash inputs, UUID normalization, SHA-256 encoding, virtual-node naming and modulo behavior are defined in §9.2. The ring generates a candidate routing version; `pg-catalog` stores the materialized bucket-to-shard table and runtime lookups use the validated active table.

- NGINX/ALB distribute HTTP requests; the ring maps data buckets to PostgreSQL shards.
- Adding the pre-provisioned shard creates a previewable map version and invokes the verified migration protocol in §9.2.
- Golden test vectors and a test asserting that materialized map version N equals ring output are mandatory.
- Compare ring remapping with modulo hashing on the same deterministic key set. Report bucket remapping and actual rows/bytes moved separately; do not claim 256 buckets guarantee even row distribution.
- V1 shard removal is preview/unit-test only; physical data drain/removal is out of scope.

## 9.4 Key-Value Store and Redis roles

Redis is the key-value technology; BullMQ is the job-queue library that uses Redis, not a replacement for Redis. Implement a small application-owned `KvStore` interface (at minimum `get`, `set` with TTL, `delete`, and atomic token-bucket operation) with a Redis adapter. The project is not reimplementing Redis; the interface, semantics, TTL/eviction/persistence trade-offs and component-specific measurements must be documented so the assignment’s Key-Value Store concept is explicitly designed and tested.

### Cache/state families (v1 baseline)

| Family | Example key | Default lifetime/policy | Source of truth and invalidation |
|---|---|---|---|
| Session/refresh state | `session:{sessionId}` | Explicit session expiry; never rely on eviction for correctness | Auth/session store; logout/revocation deletes state. If unavailable, protected session operations fail closed. |
| Rate-limit bucket | `rl:{scope}:{identity}` | Window/token-bucket expiry; atomic Lua update | Redis state is authoritative for the configured limiter window; outage follows endpoint-specific policy and emits metrics. |
| Autocomplete prefix | `autocomplete:{domain}:{scope}:{prefix}` | Short configurable TTL; evictable | Derived from catalog projections; outbox consumers refresh/invalidate; misses fall back to indexed catalog query. |
| Read-through cache | `cache:{domain}:{key}` | Short configurable TTL; evictable | PostgreSQL remains authoritative; mutations invalidate/update cache; miss falls back to source. |
| Queue/job state | BullMQ-managed queue keys | `redis-queue` uses `noeviction` and configured persistence; retention is explicit | Durable business status remains in PostgreSQL; queue outage never reports a job as complete. |

Do not store Snowflake worker-ID ownership only in Redis. Durable leases live in `pg-catalog` and have explicit owner/heartbeat/expiry semantics. For v1, configure `redis-kv` with `noeviction`, size `maxmemory` for the measured dataset, and alert at 80% usage. Bound autocomplete memory by Top-K × maximum prefix length × indexed entities. Session and rate-limit keys must not be silently evicted; each feature has a documented outage/pressure response.

**Local deployment:** use separate Redis service instances for queue state and cache/KV state where practical:

- `redis-queue`: BullMQ job state; configure a non-evicting policy (`noeviction`) and persistence suitable for local recovery.
- `redis-kv`: session metadata, rate-limit counters, autocomplete and cache; v1 uses `noeviction`, measured `maxmemory`, explicit TTLs and an alert at 80% memory usage. Do not add a separate cache instance in v1.

This is logical role separation, not Redis Cluster. Avoid adding a Redis cluster unless a later requirement justifies it. If laptop resources require a single Redis instance in the core profile, this is a documented development simplification and queue/cache keyspaces and failure tests must remain isolated.

PostgreSQL remains the source of truth for business data. Cache loss must not delete authoritative employee, leave, payroll or recruitment records. Define TTL/invalidation for every cache family.

## 9.5 Unique ID Generator

**Decision:** implement a Snowflake-style 64-bit generator, with IDs serialized as decimal strings in JSON and stored in a database type that preserves all bits. Never serialize 64-bit identifiers as JavaScript `Number` values.

Use a 41-bit millisecond timestamp, 10-bit worker ID and 12-bit per-millisecond sequence as the initial bit allocation, with a documented custom epoch. This supports up to 1,024 worker IDs and 4,096 IDs per millisecond per worker before sequence exhaustion. Unit-test boundary conditions and document the epoch before implementation.

- Each API/worker process must obtain a unique worker ID through a durable lease in `pg-catalog`; two live processes must never use the same worker ID. Keep worker-ID leases separate from the live-process registry, even though both live in `pg-catalog`.
- Record lease TTL, heartbeat interval, safety margin and reclaim rules in `docs/decisions.md`. A process must stop generating at `localLeaseExpiry − safetyMargin`; it must fail closed with a clear error after that point. Readiness requires a valid lease. A new replica cannot become ready for ID-generating writes while the catalog is unavailable.
- Handle clock moving backward explicitly (wait within a bounded policy or fail with a clear error); do not silently emit duplicate IDs.
- Human-facing display numbers such as `EMP-000123` are presentation identifiers and must not be confused with the internal globally unique ID.
- If implementation testing shows Snowflake's coordination/clock requirements are disproportionate, raise the trade-off for review rather than quietly switching algorithms; UUID/ULID is not an undocumented substitute.

Measure generation rate, latency, duplicate count across concurrent instances, sequence exhaustion handling and clock-skew behavior.

## 9.6 URL Shortener

**Decision:** the URL shortener is required for public recruitment links, not merely optional decoration.

- Provide a short-code creation service and public `GET /s/:code` redirect route.
- Persist the short-code-to-destination mapping; Redis may cache hot mappings, but PostgreSQL is authoritative.
- Use a documented short-code strategy (random Base62 code with uniqueness constraint and bounded retry is the initial choice). Do not assume Base62 of a large Snowflake ID is automatically compact.
- Validate allowed destinations to prevent open redirects; job links should resolve only to approved canonical application/job routes.
- Redirect lookup path: Redis cache → authoritative mapping store on miss → cache result → redirect. Click counts may use atomic increments, with durable aggregation if needed.
- Handle unknown/disabled codes safely. Do not expose candidate private application data in short URLs.

Measure code creation latency, redirect p50/p95/p99, cache-hit behavior, collision retries and invalid-code handling.

## 9.7 Web Crawler

**Decision:** provide a local custom HTTP crawler as the deterministic default. Define a `CrawlerProvider` interface so a Firecrawl adapter may be added as an optional integration. Firecrawl is not required for the local core and a cloud Firecrawl service must not be assumed able to reach `localhost`.

- The crawler may access only the project-owned simulated candidate portal or other explicitly authorized sources. Do not scrape LinkedIn or sites whose terms prohibit it.
- Crawl frontier and visited/deduplication state can use Redis, with bounded queue size, retries, request timeouts, per-host concurrency/politeness and a maximum page/depth limit.
- Parse listing/profile pages; normalize fields; validate email/skills/URLs; record source and crawl timestamp; deduplicate candidates by normalized email when present and a documented fallback fingerprint when absent.
- The crawler worker must access the portal over HTTP like an external site; it must not query the candidate portal's database directly.
- Candidate portal fixtures must include valid pages, pagination, duplicates, missing fields, malformed content, slow responses and occasional 404/5xx responses so retries and extraction errors are testable.
- A crawl run records started/completed/failed status and counters. Re-running the same crawl should not create duplicate candidates.

Measure pages/second, successful extraction rate, retry count, duplicate suppression and candidates imported.

## 9.8 Autocomplete

**Decision:** implement Redis-backed prefix suggestions for the `org` employee directory (HR/admin) and `public-jobs` only in v1. Managers may use the organization directory with server-side team filtering, or a normal filtered search; do not build per-manager copied indexes. Candidate autocomplete is deferred to avoid scope expansion. PostgreSQL remains the authoritative result store.

- Use Redis sorted sets keyed by domain, permission scope and normalized prefix (`autocomplete:{domain}:{scope}:{prefix}`), storing a bounded Top-K of entity IDs/display labels with ranking scores. Index writes generate relevant prefixes up to a documented maximum length; short-prefix results are capped. Rank exact match first, then prefix match and a stable usage/relevance signal, with entity ID as deterministic tie-breaker. Normalize case/whitespace and define punctuation handling. Keep authoritative records in PostgreSQL/catalog. Do not use sensitive attributes or expose private employee fields.
- Invalidate/update index entries on employee create, rename, department change, deactivation and deletion, and on public-job publish/update/close. The candidate domain is excluded from autocomplete in v1. Directory changes are driven by the transactional outbox; document the bounded eventual-consistency window.
- Compare against a fair PostgreSQL baseline using indexed prefix search and/or `pg_trgm`, not an intentionally unindexed query-per-keystroke baseline.
- Measure p50/p95/p99 suggestion latency, Top-K relevance/precision on a fixed test set, cache hit rate and index freshness.

---

# 10. Authentication and Security Design

## 10.1 Account creation and authentication

**Decision:** no unrestricted public signup that lets a user choose their own privileged role. HR/admin creates an employee invitation or pending account; the employee completes account setup using a time-limited, single-use token. Any self-registration path must create only a pending unprivileged identity until HR approval.

- Passwords are hashed with Argon2id.
- Access tokens are short-lived and used by the API; refresh/session state is tracked server-side in Redis.
- Refresh tokens are held in `HttpOnly`, `Secure` cookies in production; rotate refresh tokens and detect reuse. Cookie-based unsafe methods require CSRF protection appropriate to the chosen frontend/API deployment.
- Do not store long-lived refresh tokens in localStorage.
- Login, invitation acceptance, password recovery, `/s/:code`, and `/application-status/:token` are rate-limited. Candidate status tokens are high entropy, expiry-bound and revocable; store only token hashes where practical and return a minimal status summary.
- Next.js middleware may improve navigation UX, but Express middleware remains the security boundary for API access.

## 10.2 Role-based access control

Roles: `EMPLOYEE`, `MANAGER`, `HR`, `ADMIN`. A user may have more than one role; permissions are evaluated from assigned roles plus resource scope. A manager is also an employee and can access their own employee self-service pages.

| Capability | Employee | Manager | HR | Admin |
|---|---|---|---|---|
| View/edit own permitted profile fields | Yes | Yes | Yes | Yes |
| View another employee's full profile | No | Assigned team, limited fields | Yes | Yes, audited |
| View own payslips | Yes | Yes | Yes | Yes |
| View another person's salary/payroll | No | No by default | Yes | Yes, audited |
| Check in/out and view own attendance | Yes | Yes | Yes | Yes |
| View team attendance | No | Assigned team | Organization-wide | Organization-wide |
| Apply for own leave | Yes | Yes | Yes | Yes |
| Approve leave | No | Assigned team, first-level approval | Final/override authority | Policy/exception authority |
| Manage employees | No | Limited team information | Yes | Yes |
| Run/approve payroll batches | No | No | Yes | Yes |
| Manage jobs/candidates/recruitment | No | No by default | Yes | Yes |
| Submit/view performance review | Own view | Assigned team | Organization-wide | Organization-wide |
| Manage users/roles/system config | No | No | Limited if explicitly granted | Yes |
| View system health/audit logs | No | No | No by default | Yes |

The exact permission matrix must be enforced in backend policy/middleware and tested. Sidebar visibility is not authorization. Salary visibility, final leave authority and multi-role precedence are explicit decisions above; any later change must be reflected in tests.

## 10.3 Security requirements

- Parameterized SQL and input validation.
- Least-privilege database/application credentials.
- Public resume uploads enforce a configurable maximum size, an allow-list of declared content types, and magic-byte verification that must agree with the declared type. Store files under random object keys that do not contain original filenames or shard identifiers. Resume/document downloads require authorization, short-lived access and `Content-Disposition: attachment` where appropriate.
- No secrets committed to Git; use `.env` locally and managed secrets in AWS.
- Restrict metrics/admin endpoints from public access.
- Audit sensitive employee, payroll, role and candidate changes.
- Never log passwords, tokens, full resumes or unnecessary sensitive personal data.
- Use TLS in deployed environments.
- Provide account deactivation and a documented data-retention/deletion approach appropriate for an academic prototype.

---

# 11. Recruitment Domain Model

Recruitment is modeled independently from employees.

## Job

Suggested fields:

- `job_id`
- `title`
- `department`
- `description`
- `required_skills`
- `experience_requirement`
- `location`
- `employment_type`
- `salary_range`
- `status`
- `created_at`
- `closing_date`

## Candidate

Suggested fields:

- `candidate_id`
- `name`
- `email`
- `phone`
- `skills`
- `experience`
- `resume_reference`
- `source`
- `created_at`

## Application

Suggested fields:

- `application_id`
- `job_id`
- `candidate_id`
- `current_stage`
- `status`
- `applied_at`
- `updated_at`

## Application Stage History

Suggested fields:

- `history_id`
- `application_id`
- `from_stage`
- `to_stage`
- `changed_by`
- `timestamp`
- `notes`

## Interview

Suggested fields:

- `interview_id`
- `application_id`
- `interviewer`
- `round`
- `scheduled_at`
- `status`
- `feedback`

## Assessment

Suggested fields:

- `assessment_id`
- `application_id`
- `type`
- `score`
- `status`
- `completed_at`

---

# 11A. Business Rules for Core Workflows

## Attendance

- One attendance record per employee per supported workday/shift unless shift support is explicitly implemented.
- Duplicate check-in is rejected idempotently; check-out without an open check-in is rejected with a clear error.
- Store timestamps in UTC and evaluate workday/late status using the organization timezone and configured working hours.
- Maintain a configurable holiday/weekend calendar. The initial prototype may use one organization calendar and a single-day shift; overnight shifts are out of scope unless added deliberately.
- Half-day/late/absent classifications and grace periods are configuration-driven. The demo must state its rules.

## Leave

- Leave policies define type, annual allowance, carry-forward (if supported), approval chain and whether holidays/weekends count.
- Reject overlapping active leave requests for the same employee unless policy explicitly permits it.
- Validate date order, balance and year-boundary behavior. Cancellation/rejection must update reserved/consumed balance consistently.
- Leave approval states are `PENDING_MANAGER`, `PENDING_HR`, `APPROVED`, `REJECTED`, `CANCELLED`. The manager of the employee is the first approver; HR is the second/final approver. If no manager is assigned, skip directly to `PENDING_HR`. HR may override a manager rejection only through a separately audited override action with a reason. No actor may approve their own leave or performance review. An HR requester must be handled by a different HR user or an Admin; an Admin requester must be handled by a different Admin. If no eligible approver exists, keep the request pending and surface an Admin reassignment task; never auto-approve it. When an approver is deactivated, pending requests are reassigned to an eligible active approver and audited. Every transition is authorized, version-checked and audited.
- Leave approval plus outbox-event creation occur in one transaction on the owning database shard.

## Payroll

- This is a demonstrative payroll calculator, not tax filing or actual bank disbursement.
- Salary structure includes basic pay, allowances, configured deductions and loss-of-pay (LOP). Tax/PF rules are simplified configurable demonstration rules and must be labelled as such; do not claim legal payroll compliance.
- Calculate from a frozen pay-period snapshot of salary and relevant attendance/leave inputs so reruns are reproducible.
- Initial demonstrator formula: `gross = basic + allowances`; `fixed_monthly_earnings = gross`; `daily_rate = fixed_monthly_earnings / scheduled_workdays`; `LOP = daily_rate × unpaid_absence_days`; `net = gross − LOP − configured_deductions`. Paid leave is not counted as unpaid absence. PF/tax are configurable demonstration deductions, not legal calculations. Apply a single documented rounding rule at the final paise boundary.
- Store money as integer paise or exact decimal values with documented rounding. Never use JavaScript floating-point for money arithmetic.
- A payroll row is unique by employee and pay period. Re-running a completed batch must not create duplicate records; reruns require an explicit retry/correction policy.
- Run payroll asynchronously in idempotent chunks, routed by employee shard. Track batch states: `PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL_FAILED`, `FAILED`, `CANCELLED`.
- Payslip visibility is restricted to the employee and authorized HR/admin roles; managers do not see salary by default.

## Recruitment state machine

- Canonical application states: `APPLIED → SCREENING → SHORTLISTED → ASSESSMENT → INTERVIEW → SELECTED`, with `REJECTED` and `WITHDRAWN` terminal states reachable from permitted non-terminal stages. `INTERVIEW` contains separate interview-round records such as Technical 1, Technical 2 and HR/Behavioral; these are not separate application states. Do not include an `OFFER` state in v1 unless an actual offer creation/acceptance workflow is implemented and reviewed as a scope change.
- Rejected/withdrawn applications are terminal unless an authorized reopen operation is recorded.
- Stage changes require role authorization, optimistic version checking or equivalent concurrency protection, and an audit/history entry.
- Assessment records include type, scheduled/completed status, score/result where applicable and evaluator metadata; interview records include round, interviewer, schedule and outcome.
- Candidate and employee are separate entities. Selection does not automatically merge rows. Candidate-to-employee conversion is an idempotent explicit workflow; it creates an employee invitation and records conversion state.
- Public applications validate required fields, rate-limit submissions and use authorized shared object storage for resumes.

## Candidate identity and sourcing

- Direct applicants and crawler-discovered candidates enter the same candidate pool with distinct source metadata.
- `pg-catalog` owns a unique normalized-email-to-`candidate_id` claim table. Claim the normalized email transactionally before creating/importing a candidate; concurrent direct applications and crawler workers must reuse the existing candidate identity idempotently.
- If email is absent, use a documented conservative fingerprint and flag possible duplicates for HR review rather than silently merging uncertain identities. Candidate identity claims and import retries must be safe across API/worker replicas.
- Crawler imports must be repeatable and idempotent.

# 12. Core Data Domains and Data Placement

The application has these logical domains: identity/authentication, global directory/catalog, employees, attendance, leave, payroll, recruitment/jobs, candidates/applications, performance, notifications/outbox, search indexes and system configuration.

## 12.1 Initial entity inventory and placement

`employee_id` is a UUID identity. Employee-owned rows use `bucket_id = stableEmployeeBucket(employee_id)` and are routed by the active employee routing map. The fixed v1 bucket count is 256. `pg-catalog` is a separate PostgreSQL service, not one of the employee shards. All IDs and foreign references are serialized as strings in JSON.

| Entity/table family | Placement | Ownership/notes |
|---|---|---|
| `users`, credential hashes, `user_roles`, `invitations`, normalized email identity claims | `pg-catalog` | Authoritative identity and global uniqueness; catalog outage blocks new login/identity resolution. Invitation payload contains no salary/payroll data. |
| `employees`, attendance records, leave balances/requests, salary structures, payroll employee-period records, payslip metadata, performance cycles/goals/reviews | Employee shard by `employee_id` and required `bucket_id` | Authoritative employee-owned data; every table is listed in `docs/shard-owned-tables.md`. |
| `notifications`, `outbox_events` | Owning employee shard | Event/notification ownership follows the employee; `outbox_events` is drained before migration copy and is not copied. |
| `employee_directory`, employee search projections, departments, designations, leave policies, holidays | `pg-catalog` | Directory/configuration projections; employee directory is derived from outbox events and can be rebuilt. |
| `jobs`, job publication metadata, `short_urls`, crawler run/page metadata | `pg-catalog` | Global recruitment/control metadata. |
| `candidates`, `applications`, `application_stage_history`, `interviews`, `assessments` | Candidate domain on shards 1–3 using `candidate-v1` | Candidate-owned rows route by `candidate_id`; tables carry indexed `candidate_bucket_id NOT NULL`; candidate map is separate and pinned in v1. |
| Candidate normalized-email claims | `pg-catalog` | Global unique claim; ambiguous no-email matches require HR review. |
| `payroll_batches` | `pg-catalog` | Global batch status; individual payroll records remain on employee shards. |
| Worker-ID leases, process registry, shard registry, `routing_map_versions`, `routing_map_buckets`, migration records | `pg-catalog` | Durable control-plane metadata. Worker leases and process registrations are separate tables/contracts. |
| `audit_logs` | `pg-catalog` | Central audit search/projection. Catalog-owned control-plane mutations and their audit record commit in the same catalog transaction and fail closed if durable audit cannot be recorded. Shard-local business audit events originate durably in the owning shard transaction and are projected here asynchronously; the catalog is not a synchronous dependency for leave, employee, recruitment or payroll mutations. |
| Resume/document objects | Shared object storage (MinIO/S3) | Random object keys never encode original filename or shard ID; object metadata/reference lives in the relevant authoritative record. |

The canonical `docs/shard-owned-tables.md` manifest lists every employee-owned table with `table`, `domain`, `owner key column`, `bucket column`, parent-before-child copy order, checksum columns and explicit exclusion status. Every employee-owned table has `employee_id` and `bucket_id NOT NULL` plus an index. Every candidate-owned table has `candidate_id` and `candidate_bucket_id NOT NULL` plus an index. CI fails if a schema migration introduces a table containing `employee_id` or `candidate_id` without an explicit ownership/routing declaration in the manifest. Candidate tables are declared separately and are not silently added to the employee migration set.

## 12.2 Directory, identity and routing ownership

`pg-catalog` owns identity claims, credentials/roles/invitations, employee directory projections, global recruitment/control metadata, routing-map versions, migration state and worker leases. Employee shards remain authoritative for employee profiles and employee-owned operational records. Catalog projections are derived, idempotently updated from outbox events and can be rebuilt by an Admin-only audited `rebuild-directory-from-shards` job. Catalog-owned mutations that are part of business workflows must check the durable catalog business-write gate in the same catalog transaction; they are naturally unavailable during a catalog outage. Shard-local business writes instead use local process-registration validity plus the owning shard's durable gate/fence, so they do not need a synchronous catalog check on every write.

Do not perform an unbounded catalog lookup for every known-employee read: the loaded, versioned routing map resolves bucket ownership. Login and email-to-employee resolution require `pg-catalog`; catalog outage blocks those flows rather than guessing a shard. A deactivation event removes the employee from directory/autocomplete and deletes Redis session/refresh state. Access-token TTL is the maximum revocation bound for already-issued stateless access tokens; use a short TTL recorded in `docs/decisions.md` and enforce a current-account/status check for sensitive mutations where required.

Global reports/search use the catalog/index or bounded scatter-gather. Scatter-gather and per-shard metrics filter by buckets owned by that shard in the active map, so retained source copies after migration are not double-counted. A global dashboard may use a precomputed aggregate but must label it eventually consistent when updated asynchronously.

## 12.3 Money, dates and uniqueness

- Store monetary amounts as integer paise or an exact decimal type; never use binary floating-point for payroll calculations.
- Store timestamps in UTC; display in the configured organization timezone (initially Asia/Kolkata).
- Use explicit uniqueness constraints for normalized emails, employee-period payroll records, attendance check-in/day constraints where applicable, application identifiers and short codes.
- Cross-shard relationships are validated in application services; do not assume PostgreSQL can enforce a foreign key across physical shards.

---

# 13. Background Job Architecture

Long-running/bulk operations must not hold an HTTP request open until all work is complete.

## Local

`Express API → JobQueue interface → BullMQ → redis-queue → Worker`

## AWS

`Express API → JobQueue interface → SQS → ECS Worker`

Business modules depend on a `JobQueue` interface (`enqueuePayroll`, `enqueueNotification`, `enqueueCrawler`, etc.), not directly on BullMQ or SQS. Queue adapters are selected by environment configuration. Worker code and domain logic are shared between deployments.

### Job requirements

- Define retryable versus non-retryable errors, bounded retry/backoff, job timeouts and dead-letter/failed-job inspection.
- Jobs must be idempotent or use idempotency keys; assume at-least-once delivery, not exactly-once execution.
- Payroll work is chunked by shard/employee group, with a unique employee+pay-period key preventing duplicate payroll rows.
- Worker concurrency and DB pool sizes are configured together to avoid exhausting PostgreSQL connections.
- Queue failure must be visible to operators; APIs that enqueue asynchronous work return a job/batch identifier and a clear accepted/pending state.

### Transactional outbox

The mandatory v1 outbox scope is **employee create, update and deactivate**, plus **leave approval/rejection decisions**, and durable audit events for shard-local audit-worthy actions. The business change and applicable `outbox_events` rows are committed in the same transaction on the owning employee shard. For each shard-local audit-worthy mutation, an `AUDIT` outbox event is part of that same transaction and contains the actor, action, resource/entity, timestamp, correlation/idempotency ID and appropriately redacted change metadata. This event is the durable audit source until delivered; it is not merely an after-the-fact best-effort log. The dispatcher projects it into `pg-catalog.audit_logs` asynchronously, deduplicated by event ID. Catalog delivery failure must not roll back or block an otherwise valid shard-local business transaction, and must not lose the source event. The dispatcher runs as a worker and polls every active employee shard safely under concurrency; publishing is at-least-once and every consumer is idempotent by event ID. Employee directory projection upserts carry an employee version and reject older events, so a delayed update cannot overwrite a newer deactivation. Failed events enter a visible dead-letter state with retry/error metadata. An Admin-only audited `rebuild-directory-from-shards` job reconciles projections from authoritative shard data.

Before shard migration copy begins, drain relevant outbox events and pause dispatch during the gated copy/cutover. Outbox rows are excluded from the bucket copy. After the gate reopens, the dispatcher resumes polling all active shards; it must not mark an event delivered before successful queue publication. Notification delivery can be retried without duplicating the authoritative notification record.

### Candidate-to-employee conversion

Do not build a general saga orchestration framework. Implement an explicit idempotent conversion state machine: selected application → conversion pending → employee/invitation created → candidate/application marked converted. Repeated retries must resolve to the same employee and must not create duplicates. If the workflow crosses databases/shards, persist progress and provide a reconciliation path.

---

# 14. Notification Architecture

Notifications have an in-app record and, where configured, an email delivery.

- Business transaction writes an outbox event for critical events.
- Dispatcher publishes to the configured queue.
- Notification worker creates/delivers the notification idempotently.
- Local development uses Mailpit to capture email without sending real messages.
- AWS may use Resend through an `EmailProvider` adapter; sending requires configured credentials and a verified sender/domain where the provider requires it.
- Email failure must not roll back an already committed leave/payroll transaction. Delivery state is retried and visible to HR/admin.

Events include leave submitted/approved/rejected, payroll batch/employee payslip ready, interview/application stage changes where appropriate, review reminders and HR announcements. Avoid sending confidential salary details in email; notify the user to authenticate and view the protected payslip instead.

---

# 15. Search Architecture

Search has two distinct stages:

1. **Autocomplete:** low-latency Redis-backed prefix suggestions, filtered by the caller's permissions.
2. **Authoritative results:** PostgreSQL/catalog lookup through the appropriate query service and ShardRouter.

Autocomplete is never the source of truth. Suggestions must not leak salaries or private employee fields. Updates/deletions invalidate or refresh suggestion indexes; asynchronous indexing may be eventually consistent for a documented bounded interval.

Global employee search and team views use the employee directory/catalog or bounded scatter-gather. The implementation must measure search latency and compare autocomplete with a fair indexed PostgreSQL prefix/`pg_trgm` baseline.

---

# 16. Application Architecture

## 16.1 Local architecture

```text
Browser / k6
     |
     v
NGINX reverse proxy + load balancer
     |
     +------ API replica 1
     +------ API replica 2
     +------ API replica 3
                  |
        Express modular-monolith API
         |           |             |                  |
         |           |             |                  +--> JobQueue interface
         |           |             |                            |
         |           |             |                       redis-queue
         |           |             |                            |
         |           |             |                       Worker / outbox dispatcher
         |           |             |                       (polls all active shards)
         |           |             |
         |           |             +--> redis-kv (session/cache/rate limit/autocomplete)
         |           |
         |           +--> pg-catalog (identity, process registry, routing maps,
         |                migration metadata, directory projections, audit projection)
         |
         +--> ShardRouter --> shard-1 / shard-2 / shard-3 (active employee shards)
                          \--> shard-4 (pre-provisioned STANDBY until migration)
                          Per-shard durable write gate + transaction-scoped fence

API/worker --shared StorageProvider--> MinIO (resumes/documents)
Candidate Portal --HTTP--> local crawler worker
Prometheus scrapes API replicas, worker and exporters directly
Grafana visualizes Prometheus data
```

This is a single-repository multi-application project with a modular monolith API and separate worker. It is not a collection of independently deployed microservices for every HR domain.

## 16.2 AWS architecture

```text
Users -> ALB -> ECS API service (multiple tasks)
                     |       |        |        |
                     |       |        |        +--> S3 documents
                     |       |        +--> SQS -> ECS worker service
                     |       +--> ElastiCache/Valkey (KV/session/cache)
                     +--> RDS PostgreSQL (initial cost-conscious logical shards)

CloudWatch and/or Prometheus/Grafana provide monitoring.
```

The AWS implementation is optional after local validation. The first cloud deployment should use one RDS instance with clearly separated logical shard namespaces/databases if feasible, while retaining the same ShardRouter interface. This is **not** equivalent to three physically independent RDS instances and must be described honestly. Do not create three RDS instances by default; consider physical AWS shards only if credits/budget and time allow.

---

# 17. Local Infrastructure

The core product must run locally without AWS credentials or cloud services. Use Docker Compose for repeatable infrastructure.

## 17.1 Core profile

- Next.js web application
- Express API (one replica for ordinary development; scalable replicas for experiments)
- Worker service
- Simulated candidate portal
- Three active PostgreSQL shard containers (`shard-1` through `shard-3`)
- One pre-provisioned PostgreSQL standby (`shard-4`, not in active ring until registered) for the shard-add demo
- Separate PostgreSQL `pg-catalog` container for global identity/directory/control metadata, durable worker-ID leases, live-process registry and routing maps
- Separate Redis queue backend and Redis KV/cache service
- NGINX
- MinIO for shared resume/document uploads
- Mailpit for local email capture

## 17.2 Observability profile

- Prometheus
- Grafana
- cAdvisor for container CPU/memory metrics
- PostgreSQL exporter(s)
- Redis exporter(s)

Prometheus must scrape API replicas and worker/exporters directly rather than scraping `/metrics` through NGINX and accidentally sampling one random replica. The public ingress must not expose `/metrics` or exporter endpoints.

## 17.3 Load-test profile

- k6 test runner and test scenarios
- Optional generated seed-data job

Use Compose profiles such as `core`, `observability`, and `loadtest` to avoid starting every container during normal development. Document tested minimum RAM and expected CPU/storage requirements after the stack is validated on the development machine; do not invent a minimum before testing.

## 17.4 Storage

Use MinIO locally for files shared across API replicas. A local per-container filesystem is not acceptable for uploaded resumes/documents once multiple API replicas are used. The `StorageProvider` abstraction maps MinIO locally to S3 in AWS.

---

# 18. Load Balancing and Horizontal Scaling

## Local

NGINX acts as reverse proxy and load balancer between the browser/k6 and existing API replicas. Start with round-robin as a baseline and benchmark `least_conn` as an alternative; state which algorithm is active for every recorded run. Configure Docker service discovery/resolution so replica changes do not leave stale upstream addresses. Configure passive failure handling (`max_fails`/`fail_timeout`) and test an unavailable API instance.

NGINX does not create or remove replicas. The operator changes Compose replica count for the local experiment. Report replica count and host resource limits with every result.

## AWS

ALB distributes HTTP traffic to healthy ECS tasks. ECS service autoscaling is the cloud scaling mechanism. ALB HTTP balancing and the consistent-hash ring used by ShardRouter for database bucket placement solve different problems and must not be conflated.

---

# 19. Observability

Instrument from Phase 1; observability is not postponed until after feature development.

## Metrics sources

- API: request count, latency histogram, status/error count, rate-limit rejections, per-route traffic and shard routing counters.
- Worker: jobs queued/processed/failed/retried, queue wait time and processing duration.
- ShardRouter: requests/queries per shard, query duration, pool usage and routing errors.
- Redis: operation latency, memory, cache hits/misses and queue state.
- PostgreSQL: connections, query/activity and resource metrics via exporter.
- Containers: CPU/memory via cAdvisor.
- Crawler, ID generator, URL shortener and autocomplete: component-specific counters/histograms.

Prometheus scrapes each API replica directly (or through a stable per-replica discovery arrangement), worker and exporters. `/metrics` is not public. Grafana dashboards include application performance, worker/queue, shard distribution, search, rate limiting and resource use.

The HR Reports area is for business reports. System health and infrastructure metrics belong in an Admin-only System Health page or a protected Grafana view, not mixed into ordinary HR reports.

---

# 20. Performance Evaluation Requirements

The assignment requires at least three workload levels and measured tables/graphs. No performance results may be fabricated in the PRD; actual results belong in `docs/experiments/` after execution.

## 20.1 Protocol

- Use open-model/arrival-rate load generation for burst and rate-limiter tests; use fixed-VU tests only when that workload model is explicitly intended.
- Run each workload at least three times after warm-up. Report each run’s p50/p95/p99 and summarize p95/p99 across runs with median and range; do not average percentiles across runs.
- Define rate-limiter false rejection as legitimate requests rejected while the test identity remains under its configured token-bucket allowance; target zero in controlled deterministic tests.
- For the single-database versus three-shard comparison, publish both the total-resource budget and per-instance resource limits. Do not present results as an apples-to-apples scaling claim unless CPU/memory allocation and workload are comparable.
- Include a skewed workload (Zipf-like employee access or a documented hot-employee distribution) in addition to uniform traffic.
- Define low/medium/high concurrency after a pilot run confirms the machine can run the stack without uncontrolled swapping. Record exact virtual users, duration, ramp-up, endpoint mix and seed-data size.
- Report p50, p95 and p99 latency, throughput (requests/second), success/error rate, CPU and memory, plus relevant component-specific metrics.
- Use a fixed read/write mix for comparisons and record all resource limits, replica counts, container versions and host specifications.
- Run k6 within a declared resource budget. If k6 shares the laptop with the app, state that it consumes host resources and interpret absolute numbers accordingly.
- Provide a test-only rate-limit configuration or dedicated test identity; never disable rate limiting silently in production-like measurements.
- Include a realistic 9:00 AM attendance check-in burst as one workload profile, in addition to mixed CRUD/search traffic.
- Compare a baseline and proposed design where meaningful. Do not claim sharding or horizontal scaling is faster unless measurements support that conclusion.

## 20.2 Data generation plan

Create a deterministic seed generator with a fixed random seed and configurable counts for employees, attendance rows, leave requests, payroll periods, jobs, candidates and applications. Record the generator version and actual row counts in each run. Start with small fixtures for functional tests, then scale dataset sizes based on available memory/disk. Capacity examples in this PRD are planning assumptions, not measured or required production volumes.

A planning scenario may model 10,000 employees and approximately 250 attendance records per employee-year (~2.5 million attendance records), plus 12 employee-payroll records per year. This is a sizing exercise only; the dataset used in experiments must be stated separately.

## 20.3 General metrics

- Mean, p50, p95 and p99 response latency
- Throughput
- Successful request rate and error rate by status
- CPU and memory usage per relevant container
- Queue depth/wait/processing time
- Database connection pool saturation and query latency

## 20.4 Component metrics

- Rate limiter: allowed/rejected counts, rejection rate, false rejection in controlled tests, outage behavior.
- Sharding: rows/queries/latency per shard, skew, hot shard behavior and routing correctness.
- Consistent hashing: keys per node, distribution variance and remapping percentage on add/remove.
- Write fence: measure the cost of the `ShardRouter` shared-fence acquisition and durable gate check. Report p50/p95/p99 write latency, throughput and error rate with the fence enabled, plus the comparable isolated test-harness baseline without fence overhead. Keep dataset, SQL operation, transaction shape, connection-pool limits, machine resources, warm-up and request mix identical; repeat at least three runs and report each run plus median/range. Also measure the incremental latency and throughput change in absolute and percentage terms. The no-fence path is a benchmark-only control, never a production write path.
- KV store: GET/SET latency, cache hit/miss, memory and behavior on cache loss.
- ID generator: IDs/second, p50/p95 generation latency, duplicate count under concurrent replicas, clock/sequence edge cases.
- URL shortener: creation and redirect p50/p95/p99, cache-hit rate, collision retries, invalid-code rate.
- Crawler: pages/second, extraction success, retries, duplicate suppression and import count.
- Autocomplete: p50/p95/p99, Top-K precision/relevance on a fixed labelled query set, cache hit rate and index freshness.

## 20.5 Targets

The PRD does not assert unmeasured numeric SLOs. After a pilot run, define achievable target thresholds for the demo (for example, autocomplete p95 latency on the chosen seed dataset) and mark them as **project targets**, not production guarantees. The final report must show target versus measured value and explain misses.

---

# 21. Baseline Comparisons

Use fair baselines that preserve useful database indexing and identical datasets/workloads.

- **Sharding:** one PostgreSQL instance versus three physical PostgreSQL shards with ShardRouter. Report (a) equal total DB CPU/memory budget and (b) equal per-instance limits as distinct experiments; do not conflate these claims. Use the same query mix and dataset seed.
- **Consistent hashing:** modulo hashing versus ring with virtual nodes; compare distribution and remapping on node add/remove.
- **Autocomplete:** Redis-backed prefix suggestions versus indexed PostgreSQL catalog `pg_trgm`/`text_pattern_ops`; same query set, result count, permissions, warm-up and result-quality checks.
- **Rate limiting:** compare protected and unprotected endpoint behavior under controlled overload; report protection/rejection rather than implying unprotected is a valid production configuration.
- **Payroll:** synchronous small-batch baseline versus asynchronous queued batch; report HTTP response time separately from total batch completion time.
- **Load balancing:** round-robin versus `least_conn` if the test workload and request durations make comparison meaningful.
- **Write-fence overhead:** compare the production `ShardRouter` fenced-write path with an isolated benchmark-only control that runs the equivalent operation without the fence. Keep the dataset, SQL, transaction shape, pool limits, resources and workload identical; use at least three warmed runs and report per-run p50/p95/p99, throughput, error rate, absolute/percentage overhead and median/range. The unfenced control must not be exposed as an application repository or production code path.

The report must include setup, dataset, workload, number of repetitions, measured results and limitations for every claimed comparison.

---

# 22. Scalability and Failure Scenarios

The minimum is one meaningful scalability or failure scenario; the planned test suite includes the following, with implemented versus simulated behavior clearly labelled.

## Scenario A: Dataset growth

Increase employee and attendance seed sizes. Measure authoritative search, profile/attendance query latency, shard distribution, API throughput and database resources.

## Scenario B: Add a physical PostgreSQL shard (required)

Register the pre-provisioned standby shard through the Admin-only control plane, preview the versioned ring change, close the globally enforced write gate, wait for every unexpired process to acknowledge the gate epoch and drain fenced writes/outbox events, then copy every moved bucket table in the ownership manifest. Verify counts, checksums and relationships; while writes remain gated, atomically activate the new map and require all unexpired processes to acknowledge it. Run read-only smoke tests before reopening writes. A failed pre-resume test may revert the map; after the first accepted write, use forward repair rather than blind rollback. Report gate/read-availability/write-503 behavior, moved buckets, actual rows/bytes copied, copy/verification/cutover duration, errors and ring remapping versus modulo baseline. Label any simulated step and do not claim physical rebalancing if the data was not moved.

## Scenario C: Add API replicas

Compare one, two and three API replicas behind NGINX using identical workload and resource limits. Include total host resource use because replicas share the same machine.

## Scenario D: API instance failure

Stop one API instance during a test. Measure failed requests, recovery, load on remaining replicas and NGINX behavior.

## Scenario E: Worker failure/retry

Stop a worker during queued jobs, restart it and verify retries/idempotency and final job state. No duplicate payroll records or duplicate candidate imports should result.

## Scenario F: Redis role failure

Test queue Redis and KV/cache Redis independently. Document which features fail open, fail closed or degrade. Cache failure should fall back to PostgreSQL where safe; queue outage must not silently report asynchronous work as completed.

## Scenario G: Attendance spike

Generate a burst of check-in requests around a simulated 9:00 AM peak. Observe API latency, rate limiting, shard load, connection pool and error rate.

## Scenario H: Crawler source failures

Inject malformed pages, duplicates, timeouts and 404/5xx responses. Verify bounded retries, deduplication and a completed/partial/failed crawl status.

## Scenario I: One employee shard unavailable (required)

Stop one active shard. Per-shard connection/query timeouts and a circuit breaker must prevent a hung shard from exhausting pools or stalling healthy shards. Direct operations for employees owned by that shard fail with a clear retriable service error rather than reading/writing another shard. Operations on healthy shards continue. Scatter-gather directory/search results return `partial=true` and identify unavailable shard(s); never silently present partial results as complete. Restore the shard and verify recovery.

## Scenario J: Catalog unavailable (required)

Stop `pg-catalog`. New login/email-to-employee resolution, invitation reservation, shard-membership changes, new process registration and directory projection writes fail closed. Existing registered processes evaluate registration validity locally from their last successful heartbeat and may continue only until their conservative local registration deadline; they do not query the unavailable catalog on each business write. A process without a locally valid registration cannot write. With D-002 values, the process-registration write deadline is approximately 20 seconds after the send time of its last successful heartbeat (`30 s` TTL minus `10 s` safety margin), computed using the local monotonic clock. Assert in the outage test that shard writes stop by this registration deadline. Separately, with D-003 values, the worker-ID lease deadline is approximately 45 seconds after the send time of its last successful lease renewal (`60 s` TTL minus `15 s` safety margin); assert that ID generation stops by this lease deadline. These are independent bounds: the earlier registry deadline limits all shard writes first, so the 45-second ID-lease bound must never be described as permission to continue business writes for 45 seconds. A process without a valid worker-ID lease cannot become ready for ID-generating writes; ID generation fails closed at its own local deadline. Existing shard-local operations may continue only when identity/authorization and the current routing map are already available locally, the target shard is healthy and its durable write gate is `OPEN`, and the operation does not require catalog access. If migration has set any involved shard gate to `GATED`, those writes remain blocked regardless of catalog outage. Restore catalog and verify no duplicate IDs, then run audit/outbox, identity, projection and index-freshness reconciliation checks.


## Scenario K: Stale writer and migration gate (required for shard-add acceptance)

Pause a registered API/worker process after its initial gate check but before the authoritative write commits. Start migration and verify that exclusive per-shard fences drain in-flight transactions before each durable `GATED` marker is committed and copy cannot begin until every involved shard is marked and all live processes acknowledge the gate epoch. Simulate a stale process or a process starting during the gated window and attempt a write using the old map; it must be rejected/fenced and must not commit to the source after cutover. Crash the migrator after durable markers are written and stop `pg-catalog`; every marked shard must remain fail-closed. Restore services and verify explicit recovery can safely continue or abort. Verify that a process cannot write after its local registration deadline, that all processes acknowledge the new map before any gate is reopened, and that failed read-only smoke tests revert the map while writes remain gated. Record write-503 counts and read success rate during the window.

---

# 23. Reliability Requirements

The system should:

- Avoid losing queued background jobs during normal worker restarts.
- Retry transient background-job failures.
- Prevent duplicate processing where practical through idempotency.
- Return useful errors to clients.
- Keep one failed API instance from taking down the whole API layer.
- Detect unhealthy workers/services through monitoring.
- Maintain authoritative data in PostgreSQL rather than depending solely on cache state.

---

# 24. API Design Principles

The backend exposes REST APIs under a single versioned prefix. Use resource-based route names; authorization is enforced by permission middleware, not by route prefix alone.

```text
/api/v1/auth/*
/api/v1/users/*
/api/v1/employees/*
/api/v1/attendance/*
/api/v1/leave/*
/api/v1/payroll/*
/api/v1/jobs/*
/api/v1/recruitment/*
/api/v1/candidates/*
/api/v1/applications/*
/api/v1/performance/*
/api/v1/notifications/*
/api/v1/search/*
/api/v1/reports/*
/api/v1/admin/*
/api/v1/system/*
```

Suggested conventions:

- `GET /api/v1/employees/me` — current employee's permitted profile.
- `GET /api/v1/employees` — authorized employee directory/search.
- `POST /api/v1/employees` — HR/admin creates employee/invitation.
- `POST /api/v1/attendance/check-in` and `/check-out` — idempotent attendance operations.
- `POST /api/v1/leave/requests`; `POST /api/v1/leave/requests/:id/approve` or `/reject` — permission-checked workflow transitions.
- `POST /api/v1/payroll/batches` — enqueue a payroll batch and return a batch/job ID; `GET /api/v1/payroll/batches/:batchId` — batch status.
- `GET /api/v1/payroll/payslips/:payslipId` — protected employee payslip; distinct from payroll batch endpoints.
- `GET /jobs`, `GET /jobs/:slug`, `POST /jobs/:jobId/applications` — public candidate flow through the web app; backend API still validates input/rate limits.
- `GET /s/:code` — public short URL redirect.

All list endpoints define pagination, stable ordering and maximum page size. Global queries specify whether they use catalog/index, scatter-gather or precomputed aggregates. Use consistent error shapes and request/correlation IDs. Never rely on the route name as the only access-control mechanism.

---

# 25. Technology Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

## Backend

- Node.js
- Express.js
- TypeScript

## Database

- PostgreSQL accessed through `pg` pools and the shared ShardRouter
- Three active local PostgreSQL shard instances, one pre-provisioned standby shard, and a separate `pg-catalog` instance
- Explicit migration runner applied to all shards with version verification

## Key-Value Store

- Redis

## Local Job Queue

- BullMQ using Redis

## AWS Job Queue

- Amazon SQS

## Authentication

- Application-managed authentication
- Argon2id password hashing
- JWT/access-token based API authentication
- Redis-backed session/refresh state where appropriate

## Reverse Proxy / Load Balancing

- NGINX locally
- AWS Application Load Balancer in AWS

## Monitoring

- Prometheus
- Grafana

## Load Testing

- k6

## Candidate Crawler

- Custom local HTTP crawler as the deterministic default
- `CrawlerProvider` interface; optional Firecrawl adapter when reachable/configured
- Simulated external candidate portal

## Email

- Email-provider abstraction
- Resend as the initial provider where configured

## AWS Infrastructure

- ECS
- RDS PostgreSQL
- ElastiCache/Valkey-compatible Redis service
- SQS
- S3
- ALB
- CloudWatch

---

# 26. Project Structure

Use one Git repository containing several applications and shared code. The accurate description is **single-repository multi-application/workspace structure**; whether the tooling calls this a monorepo is terminology, not a reason to split repositories. Do not create a microservice for each domain.

```text
hrms-project/
├── apps/
│   ├── web/                 # Next.js App Router, role-aware UI
│   ├── api/                 # Express modular monolith
│   ├── worker/              # BullMQ/SQS worker entry point
│   └── candidate-portal/    # simulated external site; separate HTTP app
├── packages/
│   └── core/                # shared ShardRouter, ID generator, domain rules,
│                            # queue/storage/email interfaces and schemas
├── infrastructure/
│   ├── docker/
│   ├── postgres/            # schema and migration runner
│   ├── redis/
│   ├── nginx/
│   ├── minio/
│   └── monitoring/          # Prometheus, Grafana, exporters
├── docs/
│   ├── architecture/
│   ├── decisions.md
│   ├── evaluation.md
│   ├── data-dictionary.md
│   ├── api/
│   └── experiments/
├── tests/
│   ├── integration/
│   ├── system-design/
│   └── load/
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

`docs/shard-owned-tables.md` is a required canonical artifact for migration completeness and CI validation. `packages/core` is required because API and worker must use the same routing, ID, queue contract and domain logic. Shared package code must not import application entry points. If workspace tooling is used, document the repository accurately instead of claiming it is not a monorepo.

---

# 27. Infrastructure Abstraction Requirements

Business logic must depend on interfaces rather than vendor-specific clients. The same domain code should work in local and AWS deployments.

## Queue

`JobQueue` → local BullMQ/Redis or AWS SQS. The worker consumes through the selected adapter. Delivery is treated as at-least-once; handlers are idempotent.

## Email

`EmailProvider` → local Mailpit adapter or configured Resend adapter. The absence of production email credentials must not block local tests.

## Storage

`StorageProvider` → MinIO locally or S3 in AWS. Uploaded objects must be shared by all API replicas; do not use a replica-local upload directory.

## Database

`ShardRouter` → fixed buckets → versioned consistent-hash ring → three active local PostgreSQL shard pools (plus standby for migration) or configured AWS RDS logical/physical shard mappings. `pg-catalog` is a separate control/identity database. Domain services must not access shard-specific environment variables directly.

## Crawler

`CrawlerProvider` → custom local HTTP crawler by default; optional Firecrawl adapter. The default local workflow cannot depend on cloud access to localhost.

## Configuration

Environment variables are validated at startup. The canonical local database keys are `CATALOG_DATABASE_URL`, `DATABASE_SHARD_1_URL`, `DATABASE_SHARD_2_URL`, `DATABASE_SHARD_3_URL` and `DATABASE_SHARD_4_URL`. `CATALOG_DATABASE_URL` is required for the separate `pg-catalog` control/identity database. `DATABASE_SHARD_4_URL` identifies the operator-provisioned `shard-4` standby endpoint; it does not register or activate that shard, and the shard remains outside the active employee map until the audited migration workflow completes. Shard IDs/endpoints accepted by `/admin/shards` must resolve to these server-side configured entries, not client-supplied URLs. The remaining example keys include `REDIS_KV_URL`, `REDIS_QUEUE_URL`, `QUEUE_BACKEND`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `EMAIL_PROVIDER`, `CRAWLER_PROVIDER` and `APP_ENV`. Gate/lease timing and memory limits are validated configuration values. Never print secret values in logs.

---

# 28. UI/UX Requirements

## Design Direction

The HRMS shall have a premium enterprise SaaS visual language.

Characteristics:

- Light-only interface
- Spacious layouts
- Strong typography hierarchy
- Restrained use of color
- Thin borders
- Subtle shadows
- Consistent spacing
- Professional data tables
- Clear status badges
- Accessible forms
- Responsive layouts

Avoid:

- Excessive gradients
- Generic purple AI-dashboard styling
- Overly decorative animations
- Excessive rounded cards
- Crowded navigation

## Navigation Model

Before authentication:

`Top Navbar`

After authentication:

`Collapsible Sidebar + Top Utility Bar`

Both public and authenticated layouts use a fluid, full-width content area rather than a narrow centered container. Include a restrained footer on public pages and an appropriate application footer where it does not compete with workflow content. On mobile, the sidebar becomes a drawer.

This separation makes the public website feel like a product landing page and the authenticated experience feel like a professional enterprise application.

---

# 29. Accessibility and Usability

The UI should:

- Support keyboard navigation where practical.
- Provide visible focus states.
- Use accessible labels for form controls.
- Provide meaningful error messages.
- Use status colors together with text/icons rather than color alone.
- Maintain readable contrast.
- Work on desktop and smaller screens.

---

# 30. Error Handling

The API should use a consistent error structure.

Example concept:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid employee data",
    "details": {}
  }
}
```

Expected categories include:

- Validation errors
- Authentication errors
- Authorization errors
- Not found
- Rate limited
- Conflict/duplicate
- Database errors
- Queue errors
- External crawler errors
- Internal server errors

The frontend should display human-readable messages while avoiding exposure of internal implementation details.

---

# 31. Auditability

Important HR actions should be traceable, with an explicit atomicity boundary by data ownership.

Audit-worthy events include:

- Employee creation/update/deactivation
- Leave approval/rejection and audited overrides
- Payroll execution and employee-period payroll changes
- Recruitment/application stage changes and candidate status changes
- Performance review submission
- Role/permission changes
- Shard registration, migration preview/cutover/resume/abort and directory rebuild operations

Audit records/events should include actor, action, resource/entity, timestamp, correlation/idempotency ID and relevant metadata. Sensitive values (credentials, tokens, resume contents and unnecessary salary details) must not be copied into audit payloads.

**Shard-local business actions:** the authoritative shard transaction commits the business mutation and a durable `AUDIT` outbox event together. The source event is retained/retried until the catalog projection is acknowledged; projection delivery is at-least-once and deduplicated by event ID. A catalog outage can delay central audit search but cannot create a committed business mutation with no durable audit event, and cannot make a valid shard-local action depend synchronously on `pg-catalog`.

**Catalog-owned control-plane actions:** the control-plane mutation and `audit_logs` row commit in the same `pg-catalog` transaction. If the catalog or audit insert is unavailable, the control-plane action fails closed. Migration must not be declared cut over or resumed without durable catalog state/audit; if catalog fails mid-migration, durable per-shard gates remain closed until recovery.

The Admin audit-search view reads the catalog projection and must indicate projection lag/last successful synchronization where relevant. Retain source audit events until central delivery is confirmed and normal retention policy permits cleanup.

---

# 32. Data Integrity and Idempotency

The system shall prevent common duplicate-processing problems.

Examples:

- Payroll job should not be processed twice for the same employee/period without an explicit retry-safe mechanism.
- Duplicate candidate imports should be detected where possible.
- Leave approval actions should be safe against repeated submissions.
- URL short-code collisions must be handled.
- Unique identifiers must not collide.

Background jobs should be designed to be retry-safe wherever practical.

---

# 33. End-to-End Core Workflows

## Workflow 1: Employee Registration

```text
HR/Admin creates invitation (invitation ID)
 ↓
Invitee validates single-use token + rate limit
 ↓
Catalog atomically claims normalized email: INVITED → RESERVED
 ↓
Create employee UUID and write employee + outbox rows to routed shard (no salary in invitation)
 ↓
Catalog state becomes CREATED (same invitation ID; retry is idempotent)
 ↓
Reconciliation can complete or release stale RESERVED/CREATED entries
 ↓
Activate account: ACTIVE; issue session only after authoritative records exist
 ↓
Authorized HR sets salary structure in the employee-owned shard after activation
```

## Workflow 2: Login

```text
User
 ↓
Login
 ↓
Rate Limiter
 ↓
Credential Verification
 ↓
JWT/Session Creation
 ↓
Redis Session State
 ↓
Dashboard
```

## Workflow 3: Employee Search

```text
Authorized user enters query
 ↓
Rate limiter + role/scope validation
 ↓
Autocomplete cache (`autocomplete:{domain}:{scope}:{prefix}`)
 ↓ cache miss / full search
Indexed `pg-catalog` employee directory projection
 ↓ optional bounded scatter-gather for authoritative details
ShardRouter filters results by active bucket ownership map
 ↓
Return complete or explicitly partial results
```

## Workflow 4: Attendance

```text
Employee
 ↓
Check In
 ↓
Unique Attendance ID
 ↓
Shard Router
 ↓
Attendance Shard
 ↓
Confirmation
```

## Workflow 5: Leave

```text
Employee
 ↓
Apply Leave
 ↓
Leave Shard
 ↓
Manager/HR Review
 ↓
Approve/Reject
 ↓
Notification Job
 ↓
Notification Worker
 ↓
In-app + Email Notification
```

## Workflow 6: Payroll

```text
HR
 ↓
Run Payroll
 ↓
API creates job
 ↓
Queue
 ↓
Payroll Worker
 ↓
Shard Router
 ↓
Payroll Shards
 ↓
Payroll Completed
 ↓
Notification Job
 ↓
Employee notified
```

## Workflow 7: Recruitment

```text
HR creates job in pg-catalog
 ↓
Publish approved public job URL + short URL
 ↓
Candidate applies; validate form/resume and rate limit
 ↓
Catalog claims normalized candidate email (idempotent candidate_id)
 ↓
Candidate/application data stored on candidate-v1 shard by candidate_id
 ↓
APPLIED → SCREENING → SHORTLISTED → ASSESSMENT → INTERVIEW
 ↓
Interview rounds recorded separately (Technical 1, Technical 2, HR/Behavioral)
 ↓
SELECTED / REJECTED / WITHDRAWN
 ↓
Selected candidate may enter explicit idempotent employee invitation/conversion flow
```

## Workflow 8: Candidate Sourcing

```text
HR defines role + skills
 ↓
Crawler Job
 ↓
Worker
 ↓
Simulated Candidate Portal
 ↓
Extract candidates
 ↓
Normalize fields + claim normalized email in pg-catalog
 ↓
Reuse existing candidate identity or flag ambiguous match for HR
 ↓
Candidate-v1 shard
 ↓
Candidate Pool
 ↓
HR reviews candidate
```

## Workflow 9: Performance Review

```text
HR creates review cycle
 ↓
Manager reviews employee
 ↓
Goals/KPIs
 ↓
Feedback
 ↓
Rating
 ↓
Performance record
 ↓
Employee notification
```

---

# 34. Acceptance Criteria

## Functional

- [ ] Employee can activate an HR/admin-created invitation and set up an account; concurrent identical invitation attempts create at most one employee, and retries after a simulated crash resolve to the same employee. (`FR-01, NFR-CAT-01`)
- [ ] Employee can log in and log out. (`FR-02`)
- [ ] Passwords are securely hashed with Argon2id. (`FR-02, NFR-SEC-01`)
- [ ] Resume upload rejects oversize files, disallowed declared types and declared-type/magic-byte mismatches; object keys are random and do not include filenames or shard IDs. (`NFR-SEC-02`)
- [ ] Role-based access is enforced. (`FR-03, NFR-SEC-01`)
- [ ] Employee profile can be viewed/updated according to permissions. (`FR-04`)
- [ ] Employee can record attendance. (`FR-06`)
- [ ] Employee can apply for leave. (`FR-07`)
- [ ] Manager/HR can approve/reject leave. (`FR-07`)
- [ ] HR can manage employees. (`FR-04`)
- [ ] HR can run payroll. (`FR-08`)
- [ ] Payroll can execute asynchronously. (`FR-08, NFR-QUEUE-01`)
- [ ] Employees can view payroll/payslips. (`FR-08`)
- [ ] HR can create job openings. (`FR-09`)
- [ ] Candidates can apply. (`FR-09, FR-10, NFR-SEC-02`)
- [ ] HR can manage candidates and applications. (`FR-10`)
- [ ] Recruitment stages can be updated. (`FR-09, FR-10`)
- [ ] Candidate sourcing through the simulated portal works. (`FR-11, NFR-CRAWL-01`)
- [ ] HR/manager can manage performance reviews. (`FR-12`)
- [ ] Notifications are generated for key events. (`FR-13, NFR-OUTBOX-01`)

## System Design

- [ ] Rate limiter is implemented and measurable. (`NFR-RL-01`)
- [ ] Three physical PostgreSQL shards are active locally, `pg-catalog` is separate, and a pre-provisioned standby is available for the migration demonstration. (`NFR-DATA-01, NFR-MIG-01`)
- [ ] `/admin/shards` is Admin-only and audited; registration accepts only preconfigured shard IDs/endpoints and never arbitrary browser-supplied database URLs. (`FR-03, NFR-SEC-01, NFR-MIG-01`)
- [ ] Fixed-bucket shard routing is deterministic across API replicas and uses a versioned consistent-hash ring. (`NFR-DATA-01, NFR-CH-01`)
- [ ] Golden UUID-to-bucket vectors pass; each materialized routing map equals the ring output for its version. (`NFR-CH-01`)
- [ ] CI fails when a schema migration adds an employee/candidate-owned table without an explicit ownership declaration. (`NFR-MIG-03`)
- [ ] Consistent hashing is integrated into ShardRouter bucket placement and benchmarked against modulo on the same keys. (`NFR-CH-01`)
- [ ] Redis is used as the key-value store. (`NFR-KV-01`)
- [ ] Unique ID generation is implemented and benchmarked. (`NFR-ID-01`)
- [ ] URL shortener is integrated into recruitment. (`NFR-URL-01`)
- [ ] Web crawler is integrated into candidate sourcing. (`NFR-CRAWL-01`)
- [ ] Autocomplete is integrated into the `org` employee directory and public-jobs scope; unauthorized candidate/private data is never suggested. (`NFR-SEARCH-01`)
- [ ] Shard-add flow previews a versioned ring change, acquires fences across involved shards, drains writes, persists per-shard `GATED` markers, waits for live-process gate acknowledgements and drains outbox events before copy. (`NFR-MIG-01, NFR-MIG-02`)
- [ ] A stale writer paused after its initial gate check cannot commit against the old shard after cutover; a process with no locally valid registry deadline cannot write; durable per-shard gate markers survive migrator/catalog interruption. (`NFR-MIG-02`)
- [ ] `shard_write_gate` exists on each employee shard; all application/domain writes use the single fenced `ShardRouter` wrapper, the gate-blocking integration test passes, and CI/lint rejects direct pool access outside the documented exceptions. (`NFR-MIG-02, NFR-MIG-04`)
- [ ] Shard-add copies every applicable table in `docs/shard-owned-tables.md`, verifies per-table counts/checksums/relationships, runs read-only smoke tests while gated, and switches the map only after verification. (`NFR-MIG-01, NFR-MIG-03`)
- [ ] Every unexpired process acknowledges the new map version before writes resume; failed pre-resume smoke tests revert the map while the gate is closed. (`NFR-MIG-02`)
- [ ] After cutover and before source cleanup, org-wide counts equal pre-migration counts because scatter-gather and distribution metrics filter to active-map-owned buckets. (`NFR-DATA-02`)
- [ ] A failed copy or verification leaves the old routing map active and can be retried without duplicate/lost records. (`NFR-MIG-01`)
- [ ] Shard removal is preview/unit-test only; no data-drain/removal capability is claimed in v1. (`NFR-MIG-03`)
- [ ] Stopping one shard causes direct requests for its owned employees to fail clearly; healthy shards continue and global search marks partial results. (`NFR-DATA-01`)
- [ ] Stopping `pg-catalog` blocks login/email resolution and identity/routing control operations safely; the system never guesses a shard. (`NFR-CAT-01, NFR-CAT-02`)
- [ ] During a catalog outage, a previously registered process can perform eligible shard-local writes only until its locally evaluated registration deadline and valid worker-ID lease deadline; new/unregistered processes remain unready, and no per-write catalog registry query is required. (`NFR-CAT-02, NFR-MIG-02`)
- [ ] A catalog outage never causes automatic gate reopening; only a live migrator may reopen its own same-epoch markers during a proven pre-copy/no-map-change abort. Otherwise gates remain closed until explicit recovery, and migration resume requires catalog recovery, map acknowledgements and smoke tests. (`NFR-MIG-01, NFR-MIG-02`)
- [ ] A live migrator that aborts before copy/map change reopens only markers it set for its own epoch using compare-and-set; dead/ambiguous migrator state or any post-copy failure keeps gates closed for explicit recovery. (`NFR-MIG-01, NFR-MIG-02`)
- [ ] Seed tooling resolves each seeded employee-owned row through the canonical ShardRouter routing function; recomputed buckets match every stored bucket, fixed golden-vector seed UUIDs match their expected values, and every physical destination matches the active materialized map. (`NFR-CH-01, NFR-MIG-04`)
- [ ] During a simulated catalog outage, the process-registration cutoff is asserted at approximately 20 s after the last heartbeat send time, and the independent ID-generation cutoff at approximately 45 s after the last lease-renewal send time; business writes stop at the earlier registration deadline. (`NFR-CAT-02, NFR-ID-01, NFR-MIG-02`)
- [ ] Phase 1a login works only in the local-only setup and has no rate limiter; no Redis or refresh sessions are pulled into Phase 1a. (`FR-02, NFR-PORT-01`)
- [ ] A failed shard-local business transaction leaves neither its mutation nor its `AUDIT` outbox event committed; a committed mutation retains a durable audit event even when catalog delivery fails, and replay creates one logical catalog audit record. (`NFR-AUDIT-01, NFR-OUTBOX-01`)
- [ ] Catalog-owned role/shard/migration control-plane mutations fail if their audit row cannot commit in the same catalog transaction. (`NFR-AUDIT-01, NFR-SEC-01`)
- [ ] Invitation/reservation records contain no salary or payroll fields; salary setup is permitted only after employee creation and writes to the employee-owned shard. (`FR-01, NFR-DATA-01`)
- [ ] `CATALOG_DATABASE_URL` connects to `pg-catalog`; `DATABASE_SHARD_4_URL` configures but does not activate the standby, and client-supplied endpoints are rejected. (`NFR-CAT-01, NFR-MIG-01, NFR-SEC-01`)
- [ ] Concurrent employee invitations for the same normalized email result in at most one active identity. (`FR-01, NFR-CAT-01`)
- [ ] Concurrent candidate imports/applications for the same normalized email reuse one candidate identity or enter HR review when identity is ambiguous. (`FR-10, NFR-CAND-01`)
- [ ] Employee create/update/deactivate changes are propagated to directory/autocomplete through a transactional outbox and idempotent consumers. (`NFR-OUTBOX-01`)
- [ ] Rate limiter passes deterministic token-bucket tests across three API replicas; legitimate under-limit traffic has zero false rejections in the controlled test. (`NFR-RL-01`)
- [ ] URL shortener rejects every off-allow-list destination and passes a controlled collision/retry test. (`NFR-URL-01`)
- [ ] Repeating the same crawl creates no duplicate candidate records. (`NFR-CRAWL-01`)
- [ ] `KvStore` TTL expiry and atomic-operation semantics pass tests, including concurrent token-bucket updates. (`NFR-KV-01, NFR-RL-01`)
- [ ] Loss of `redis-kv` does not corrupt PostgreSQL; each cache/session/rate-limit feature follows its documented degradation policy. (`NFR-KV-01`)
- [ ] Snowflake generator worker IDs are leased durably in `pg-catalog`, separate from the process registry; after lease expiry minus safety margin, generation fails closed. Concurrent generators produce zero duplicate IDs in the test window. (`NFR-ID-01, NFR-CAT-02`)
- [ ] Catalog-outage test verifies that readiness requires a valid lease and no duplicate IDs occur after recovery. (`NFR-CAT-02`)
- [ ] Outbox consumers are idempotent by event ID; out-of-order employee events cannot overwrite newer versions; dead-letter state is visible; directory rebuild repairs a deliberately lost projection event. (`NFR-OUTBOX-01`)
- [ ] Deactivation removes the employee from autocomplete and invalidates Redis session/refresh state; access-token TTL is documented as the revocation bound. (`NFR-CAT-02, NFR-SEARCH-01`)
- [ ] Leave tests cover no-manager fallback, HR/Admin requester fallback, self-approval rejection and reassignment when an approver is deactivated. (`FR-07, NFR-SEC-01`)
- [ ] Killing a payroll worker mid-batch and retrying creates zero duplicate employee-period payroll rows. (`FR-08, NFR-QUEUE-01`)
- [ ] Status-token and short-code enumeration endpoints are rate-limited. (`NFR-RL-01, NFR-URL-01`)

## Infrastructure

- [ ] Multiple API instances can run locally. (`NFR-PORT-01`)
- [ ] NGINX load balances API instances. (`NFR-PORT-01`)
- [ ] Worker runs independently of the API. (`NFR-QUEUE-01`)
- [ ] Prometheus collects metrics. (`NFR-OBS-01`)
- [ ] Grafana visualizes metrics. (`NFR-OBS-01`)
- [ ] k6 can generate workload. (`NFR-EVAL-01`)

## Evaluation

- [ ] Low workload test completed. (`NFR-EVAL-01`)
- [ ] Medium workload test completed. (`NFR-EVAL-01`)
- [ ] High workload test completed. (`NFR-EVAL-01`)
- [ ] p50/p95/p99 response latency measured per run; p95/p99 summaries use median and range across repeated runs. (`NFR-EVAL-01`)
- [ ] Throughput measured. (`NFR-EVAL-01`)
- [ ] Success/error rate measured. (`NFR-EVAL-01`)
- [ ] Resource usage measured. (`NFR-EVAL-01`)
- [ ] Component-specific metrics measured. (`NFR-EVAL-01`)
- [ ] Write-fence overhead measured over at least three warmed runs; report per-run p50/p95/p99, throughput/error rate, absolute and percentage delta, and median/range versus the benchmark-only control. (`NFR-EVAL-01, NFR-MIG-04`)
- [ ] At least one baseline comparison completed. (`NFR-EVAL-01`)
- [ ] At least one scalability/failure scenario completed. (`NFR-EVAL-01`)
- [ ] Shard distribution evaluated. (`NFR-EVAL-01, NFR-DATA-01`)
- [ ] Server/load distribution evaluated. (`NFR-EVAL-01`)
- [ ] A shard-add migration copies, verifies and cuts over moved buckets; report read success and write-503 counts during the gate, or explicitly mark any incomplete stage as a limitation. (`NFR-MIG-01, NFR-EVAL-01`)
- [ ] Bottlenecks and trade-offs documented. (`NFR-EVAL-01`)

---
# 35. Definition of Done

The project is considered complete when:

1. The HRMS can be started locally with documented setup steps.
2. A user can register/login and reach a role-specific dashboard.
3. Employee, attendance, leave, payroll, recruitment, candidate, and performance workflows operate end-to-end.
4. The eight prescribed system-design components are implemented and integrated into real workflows.
5. PostgreSQL sharding is demonstrated using multiple local database instances.
6. API horizontal scaling is demonstrated using multiple instances behind NGINX.
7. Background jobs execute independently of the API.
8. Redis, Prometheus, Grafana, and k6 are integrated into the local environment.
9. Recruitment candidate sourcing works against the simulated external portal.
10. System metrics can be collected during experiments.
11. Low, medium, and high workload results are recorded.
12. Scalability/failure experiments are documented.
13. The architecture, algorithms, implementation, results, limitations, and trade-offs can be explained during the project demonstration.
14. The same application can be configured for an AWS deployment without rewriting core business logic; adapter contract tests pass locally and AWS smoke testing remains optional/P2.

---

# 36. Development Phases

## Phase 1a – Walking skeleton and correctness foundations

**Build in this exact dependency order. Do not start Phase 1b or pull Phase 2/3 features into the walking skeleton merely to satisfy its exit criterion.**

1. **Workspace, core package and CI:** establish the repository/workspace, shared core package, lint/type-check/unit-test pipeline and migration checks.
2. **Database/Compose foundation:** start three active PostgreSQL shards, pre-provisioned `shard-4` standby and separate `pg-catalog`; add the single versioned migration runner and required connection/config validation. Redis is not required in Phase 1a.
3. **Routing primitives:** implement UUID→bucket golden vectors, the deterministic consistent-hash ring, materialized routing-map schema and validated active-map loader. Record ring configuration in `docs/decisions.md` before relying on it.
4. **Write-fence boundary and ownership:** create the durable `shard_write_gate` table on every employee shard; implement one `ShardRouter` write wrapper that acquires the target shard's transaction-scoped shared fence and checks the durable gate in the same transaction; add an integration test proving that a gated shard rejects a write. Add `docs/shard-owned-tables.md` and its CI completeness check. Add a lint/CI rule that bans direct shard-pool access outside `ShardRouter` for application/domain code. Explicitly permitted exceptions are the `ShardRouter` implementation itself, narrowly scoped seed/migration tooling, health/diagnostic code that cannot mutate business data, and the isolated benchmark-only control used to measure fence overhead; every exception must be named in the rule and reviewed. Seed and migration tooling may bypass the normal shared-write fence only for their explicitly scoped operations; they must still use `ShardRouter`'s shared routing function/map to resolve bucket ownership and the physical shard, never hard-code shard selection or reimplement bucket hashing. The benchmark exception cannot be imported or called by production application/domain modules.
5. **ID and process lifecycle:** implement the ID generator contract plus durable worker-ID lease and separate process-registry schemas in `pg-catalog`; test expiry and fail-closed behavior using the values in `docs/decisions.md`.
6. **Seed data:** seed a known HR user with an Argon2id password hash, the minimum departments/designations/leave-policy/holiday data, and employee directory projection rows. The directory projection is populated by the seed script in Phase 1a; the transactional outbox projection pipeline arrives in Phase 3. For every seeded employee-owned row, compute and persist `bucket_id` using the canonical bucket function and resolve its physical shard through `ShardRouter`'s routing function. Add a test that recomputes the canonical UUID→bucket function for every seeded row and compares it with the persisted `bucket_id`; fixed seed UUIDs in the golden-vector fixture must also match their checked-in expected values. Assert that each selected physical shard matches the active materialized routing map.
7. **Minimal authenticated vertical slice:** implement minimal login → dashboard → directory read. Phase 1a login uses the seeded user with an Argon2id hash and a short-lived access token. It does not implement refresh sessions, require Redis, or include a rate limiter. Keep this Phase 1a stack local-only; do not expose the login service on a public/shared network. Directory results read the seeded catalog projection; authentication and authorization must be real, not a hard-coded bypass. Full invitation, refresh-session, CSRF, RBAC and rate-limiter workflows remain Phase 2; outbox-driven projection remains Phase 3.
8. **Observability and health:** expose API/worker metrics, request IDs, structured logs, health endpoints and the migration/gate state model; keep the integration-test harness active from the beginning.

**Phase 1a exit criterion:** with the documented local-only Compose dependencies running, a seeded HR user can authenticate using Argon2id verification and receive a short-lived access token, open the dashboard, and read an employee directory populated by the seed script. No refresh sessions, Redis, or rate limiter are required; login must not be exposed on a public/shared network. No authentication bypass or hard-coded directory response is allowed. The `shard_write_gate` integration test, direct-pool-access CI/lint rule, and seeded-row bucket/routing test against the golden vectors and active materialized map must pass before Phase 1a is considered complete.

## Phase 1b – Remaining local infrastructure

- Separate Redis queue/KV roles, queue abstraction, NGINX, MinIO and Mailpit
- Compose profiles, environment validation and `.env.example`
- Connection-pool budgets, per-shard timeouts and baseline Prometheus/Grafana wiring
- Verify that the core profile can run within the measured local machine budget; record the actual tested hardware rather than guessing a minimum

## Phase 2 – Identity, RBAC, audit and rate limiting

- HR/admin invitation creation, token validation and catalog reservation states; final employee activation is completed only after Phase 3 employee creation is available
- Argon2id password hashing, short-lived access tokens and rotating refresh sessions/cookies
- CSRF protection for cookie-authenticated unsafe requests
- RBAC matrix, resource-scoped permissions and automated authorization tests including self-approval rejection
- Atomic catalog audit writes for catalog-owned control-plane actions, shard-local `AUDIT` outbox events for business mutations, and minimal Admin-only audit search over the catalog projection
- Redis-backed rate limiter with atomic algorithm, trusted-proxy configuration and endpoint-specific outage policy
- Global normalized-email uniqueness under concurrent invitation acceptance; idempotent retries and stale-reservation reconciliation

## Phase 3 – Employee management, activation and directory

- Complete invitation activation after authoritative employee creation; enforce `INVITED → RESERVED → CREATED → ACTIVE` and idempotency by invitation ID
- Employee create/edit/profile/active-on-leave-terminated lifecycle flows through ShardRouter
- Transactional outbox and dispatcher for employee create/update/deactivate, catalog projection, session revocation and autocomplete freshness
- Global employee directory/catalog and email-to-employee resolution
- Employee search with bounded scatter-gather and active-map owned-bucket filters
- Redis autocomplete plus fair indexed PostgreSQL baseline
- Snowflake ID integration for operational records and employee UUID/display-ID separation
- Schema-migration version checks on all shards (not shard-rebalancing verification)

## Phase 4 – Attendance and leave

- Check-in/check-out and attendance edge-case tests
- Holidays, configured late/half-day rules and duplicate protection
- Leave balance/request/overlap/cancellation rules
- Manager-first and HR-final approval authority
- Extend the existing Phase 3 outbox to leave approval/rejection notifications
- Manager/no-manager/HR/Admin approver fallback, self-approval prevention and reassignment after approver deactivation
- In-app notification record and Mailpit email delivery

## Phase 5 – Payroll

- Documented salary structure, LOP, deduction and paise rounding rules
- Payroll batches and unique employee-period records
- Queue adapter and worker chunking by shard
- Retry-safe/idempotent processing and batch status API
- Protected payslip view/download and payroll audit events

## Phase 6 – Recruitment and URL shortener

- HR job creation and public landing/job list/detail/application/status pages plus `/s/:code` redirect route
- Public application form and protected application-status token
- Candidate/application/interview/assessment schema
- Explicit application transition rules, history and concurrency protection
- Required short-code generation, redirect, persistence, cache and safety checks
- Idempotent candidate-to-employee conversion

## Phase 7 – Candidate portal and crawler

- Simulated external portal served over HTTP with pagination and intentionally imperfect fixtures
- Local custom crawler with frontier, visited set, bounded retries and per-host concurrency
- Normalization, deduplication, import and crawl-run status
- Optional Firecrawl adapter only after local crawler works
- Crawler metrics and failure tests

## Phase 8 – Performance Management

- Goals
- Reviews
- Ratings
- Manager workflow
- HR review dashboard and minimum usable reports/settings/announcement pages

## Phase 9 – Shard migration and system integration hardening

- Admin-only audited `/admin/shards` registry/control page and shard-add preview restricted to preconfigured shard IDs/endpoints
- Enforced write-fence, live-process registry, in-flight write/outbox drain, acknowledgement protocol, ownership-manifest copy, verification, gated read-only smoke tests, pre-resume rollback and post-resume forward-repair runbook
- Directory rebuild/reconciliation job and migration stale-writer failure test
- Redis role/cache-family failure policy tests
- NGINX replica configuration and documented balancing/failure behavior
- Prometheus scraping API replicas directly plus worker/exporters/cAdvisor
- Grafana dashboards and protected Admin System Health page
- Verify MinIO, Mailpit and Compose profiles from Phase 1; do not reimplement them here
- Pool-size/concurrency review and failure scenarios

## Phase 10 – Evaluation and report

- Deterministic seed-data generator and documented row counts
- Pilot test to select feasible low/medium/high workload levels
- Warm-up, repeated runs, p50/p95/p99 and resource limits
- Mixed read/write and 9 AM attendance burst
- Fair baselines for sharding, autocomplete, consistent hashing, rate limiting and queued payroll
- API/worker/shard/Redis failure and recovery scenarios
- Store raw k6 outputs, Grafana screenshots, result tables and limitations in `docs/experiments/`
- Update `docs/evaluation.md` with actual measured results only

## Phase 11 – AWS Deployment

- ECS API
- ECS Worker
- ALB
- RDS
- ElastiCache/Valkey
- SQS
- S3
- Monitoring

AWS deployment follows successful local validation and does not block local development.

---

# 37. Architecture Trade-offs and Explicit Decisions

## Modular monolith vs microservices

**Selected:** Express modular monolith plus a separate worker and separate simulated candidate-portal app. This keeps domain boundaries clear without operating a service per HR module.

## BullMQ/Redis vs Kafka

**Selected:** BullMQ over Redis locally and SQS on AWS. Workloads are task-oriented jobs (payroll, email, crawling, reports); Kafka is not included initially because event replay/high-throughput multi-consumer streaming is not required and would add operational overhead.

## Physical local shards vs AWS database cost

**Selected:** three physical PostgreSQL containers locally to prove actual routing. Initial AWS deployment may use one RDS instance with logical shard separation behind the same router, clearly labelled as a cost-optimized deployment and not true physical multi-instance sharding. Three RDS instances are not the default.

## Shard key and global queries

**Selected:** employee-owned records route by stable UUID `employee_id` via fixed logical buckets and the versioned consistent-hash ring. A separate `pg-catalog` provides normalized email identity claims, directory projections and control metadata. Global search/reports use the catalog/index, bounded scatter-gather or explicitly eventually consistent aggregates. Do not assume cross-shard joins/foreign keys.

## Consistent hashing vs load balancing

**Selected:** NGINX/ALB distribute HTTP traffic; the versioned consistent-hash ring maps stable logical buckets to physical database shards. The ring does not replace the load balancer. Physical shard addition is demonstrated with a pre-provisioned shard and the controlled verified migration protocol in §9.2.

## ID generation

**Selected:** UUID for stable employee identity; Snowflake-style 64-bit IDs for high-volume generated operational records, JSON string serialization, durable worker-ID leasing in `pg-catalog`, and explicit clock rollback/sequence behavior. Employee display numbers are separate from internal IDs. UUID uniqueness does not determine shard placement; bucket + ring does. Reconsider only through a documented decision if implementation tests expose unacceptable complexity.

## Redis roles

**Selected:** separate queue Redis and KV/cache Redis in the normal local profile; no Redis Cluster initially. A resource-constrained combined profile may be used only with documented limitations. Queue persistence/noeviction requirements must not be mixed invisibly with cache eviction policy.

## Crawler

**Selected:** custom local HTTP crawler as default, with a `CrawlerProvider` interface and optional Firecrawl adapter. The simulated portal is accessed over HTTP, never by reading its database directly. Do not scrape LinkedIn or unauthorized sources.

## Candidate conversion consistency

**Selected:** idempotent conversion state machine and reconciliation, not a general-purpose saga framework. A full saga orchestrator is out of scope.

## Database access and migrations

**Selected:** `pg` pools behind ShardRouter for explicit control over multiple physical databases. Migration scripts are versioned and applied/verified on every shard. Connection pool limits are derived from API replicas × shard pools plus worker concurrency and checked against PostgreSQL `max_connections`.

## Storage and email

**Selected:** MinIO locally and S3 in AWS for shared files; Mailpit locally and a configured email-provider adapter (such as Resend) in AWS. Replica-local file storage and real email delivery during ordinary local tests are avoided.

## Local scaling and cloud deployment

**Selected:** Docker Compose + NGINX locally, ECS + ALB on AWS. Kubernetes is not included. NGINX distributes existing replicas but does not create them; ECS policies handle cloud autoscaling.

## Consistency model

- Strong/transactional consistency is required for authoritative employee changes, attendance, leave balances/decisions and payroll records within their owning database transaction.
- Autocomplete, candidate search indexes, notifications, crawler-derived indexes and aggregate dashboards may be eventually consistent, with invalidation/retry/freshness behavior documented.
- Cross-database operations use idempotency, outbox/reconciliation and explicit status, not an assumption of a distributed ACID transaction. Employee create/update/deactivate must use an outbox to update the global directory and autocomplete; leave approval must commit its notification outbox record in the same shard-local transaction. Candidate email claims are serialized through `pg-catalog`.

## Privacy and retention

Collect only fields needed for the prototype, enforce role-based access, restrict resumes/payroll, audit sensitive actions, define retention/deletion behavior for candidate data and avoid logging personal data unnecessarily. This is an academic prototype, not a claim of certified compliance with India's DPDP Act or other legal regimes.

## AWS cost guardrails

- Local development and grading demonstration must not require AWS.
- Deploy only after local acceptance criteria pass.
- Use a budget alert, cost tags, smallest suitable resources and a cleanup checklist.
- Avoid three RDS instances by default; evaluate ALB, NAT, RDS and ElastiCache costs before provisioning. Stop/delete resources after experiments when appropriate.
- Never promise that a service is free without checking current pricing/account eligibility.

---

# 38. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Shard routing complexity | Centralize routing in a dedicated ShardRouter |
| Cross-shard queries | Choose shard keys carefully and avoid unnecessary cross-shard joins |
| Redis unavailable | Define graceful degradation and document session/cache limitations |
| Worker failure | Retryable jobs, idempotency, monitoring |
| Duplicate crawler imports | Candidate identity checks and deduplication |
| Rate limiter misconfiguration | Environment-configurable limits and tests |
| Payroll duplicate processing | Idempotency keys and batch status checks |
| API instance failure | NGINX passive failure handling/load balancing; do not claim active health checks unless configured and verified |
| Excessive AWS cost | Start local-first, use smallest practical AWS resources, monitor credits |
| Crawler external dependency | Simulated candidate portal keeps the demo deterministic |
| Search inconsistency | PostgreSQL remains authoritative; autocomplete is only an optimization |
| Migration cutover / stale writer | Durable gate state, process registry, fenced writes, pre-resume smoke tests and stale-writer acceptance scenario |
| Catalog single point of failure | Explicit fail-closed identity/control-plane behavior, bounded existing-session behavior and tested recovery |
| Projection lag/lost event | Version-guarded idempotent outbox consumers, visible dead-letter state and directory rebuild job |
| Worker-ID lease expiry | Durable catalog lease, expiry safety margin, fail-closed generation and concurrent/outage tests |

---

# 39. Security and Privacy Considerations

The system contains employee and candidate information and therefore should treat all such information as sensitive application data.

Requirements:

- Password hashing
- Secure session handling
- RBAC
- Input validation
- Least-privilege access
- No sensitive information in logs
- Restricted resume/document access
- Secure environment variables
- No credentials committed to Git
- Auditability of sensitive HR actions

The prototype is an academic system and must not be presented as a certified production HR/payroll system.

---

# 40. Future Enhancements

Potential future work:

- Google OAuth
- Advanced full-text candidate search
- Recommendation-based candidate ranking
- Real object storage document management
- More advanced payroll rules
- Multi-region deployment
- Real-time notifications through WebSockets
- Event streaming if a future requirement justifies Kafka
- Mobile application
- Advanced analytics
- Automated interview scheduling
- More sophisticated workflow automation

These are not required for the initial prototype.

---

# 40A. Non-Functional Requirements and Traceability

Requirements use IDs so implementation and evaluation can be traced:

- **NFR-SEC-01:** every protected API enforces authentication and resource-scoped authorization server-side.
- **NFR-DATA-01:** employee-owned records route consistently through ShardRouter and all three local shards are exercised by tests.
- **NFR-DATA-02:** scatter-gather queries and per-shard distribution metrics include only buckets owned by that shard in the active routing map, preventing retained source copies from being counted twice.
- **NFR-ID-01:** concurrent API/worker instances generate no duplicate IDs in the defined test duration; IDs are serialized as strings.
- **NFR-QUEUE-01:** retrying a background job does not create duplicate payroll rows, candidate imports or notifications beyond documented delivery semantics.
- **NFR-SEARCH-01:** autocomplete suggestions are permission-scoped and authoritative results come from PostgreSQL/catalog.
- **NFR-OBS-01:** core API/worker metrics are available from Phase 1 and protected from public access.
- **NFR-EVAL-01:** low/medium/high workload results include p50/p95/p99, throughput, success/error rate, CPU/memory, dataset size and run configuration.
- **NFR-PORT-01:** local core features run without AWS credentials; provider differences are isolated behind adapters.
- **NFR-STORAGE-01:** uploaded files are available to all API replicas through shared object storage.
- **NFR-CH-01:** for a fixed ring version, every process maps each bucket deterministically; the same key set is used to compare remapping against modulo hashing.
- **NFR-MIG-01:** the active routing map cannot change before moved-bucket copy, verification and gated read-only smoke tests succeed; failed pre-resume migrations leave the old map authoritative.
- **NFR-MIG-02:** process registration validity is evaluated locally from the last successful catalog heartbeat using a monotonic deadline computed from heartbeat-request send time plus TTL, with the configured safety margin; shard-owned business writes do not require a synchronous catalog registry query. Every shard-owned write acquires the target shard's transaction-scoped fence and checks its durable gate marker; catalog-owned writes check the catalog gate in the same catalog transaction. Migration acquires exclusive fences across all involved shards, drains in-flight writes, persists `GATED` markers before copy, and keeps those markers closed through verification, cutover and map acknowledgements. A live migrator may compare-and-set only its own epoch's markers back to `OPEN` only before any copy or map change; otherwise gates stay closed for explicit recovery. Stale or unregistered processes cannot commit writes; catalog failure during migration leaves gates closed.
- **NFR-MIG-03:** every employee-owned table is in `docs/shard-owned-tables.md`, has `employee_id` and `bucket_id NOT NULL`, and is included in copy/verification unless explicitly excluded. Candidate-domain tables use the separate pinned `candidate-v1` map in v1.
- **NFR-MIG-04:** every application/domain write to an employee shard passes through the single `ShardRouter` fenced-write wrapper; CI/lint rejects direct shard-pool access outside explicitly permitted infrastructure/seed/migration/health and benchmark-test exceptions. An integration test proves a `GATED` shard rejects writes. Fence overhead is measured and reported against a benchmark-only equivalent-operation control; the control cannot be used by production application code.
- **NFR-CAT-01:** normalized employee and candidate email claims are globally unique in their respective catalog claim tables; catalog outage never causes guessed shard routing or bypassed identity checks.
- **NFR-CAT-02:** process registration and worker-ID leases are durable, separate contracts in `pg-catalog`; lease expiry minus safety margin stops ID generation, and recovery tests demonstrate zero duplicate IDs. Deactivation deletes Redis session/refresh state; access-token TTL is the maximum revocation bound for already-issued tokens.
- **NFR-OUTBOX-01:** employee create/update/deactivate, leave decisions and shard-local audit-worthy actions write their required outbox events in the same authoritative transaction; consumers are idempotent by event ID, projections are version-guarded, dead-letter state is visible, and index freshness/rebuild is measurable. Catalog outage delays central audit projection but does not lose or synchronously block a shard-local audit event.
- **NFR-AUDIT-01:** shard-local business mutations and durable audit outbox events commit atomically on the owning shard; central audit projection is idempotent and asynchronous. Catalog-owned control-plane mutations and their audit rows commit atomically in `pg-catalog` and fail closed if audit persistence fails.
- **NFR-CAND-01:** normalized candidate email claims are unique globally; repeated imports reuse an existing identity and ambiguous identities are flagged for HR review.
- **NFR-RL-01:** deterministic token-bucket tests pass across three API replicas; legitimate under-limit traffic has zero false rejections in the controlled test.
- **NFR-URL-01:** all off-allow-list short-link destinations are rejected; collision retry behavior passes a deterministic injected-collision test. Short-code and candidate-status endpoints are rate-limited to bound enumeration.
- **NFR-CRAWL-01:** repeating the same crawl creates zero duplicate candidate records.
- **NFR-KV-01:** `KvStore` implements TTL and atomic-operation semantics; `redis-kv` loss never corrupts PostgreSQL and each feature follows a documented fail-open/fail-closed/degraded policy. v1 `redis-kv` uses `noeviction` with measured memory sizing and an alert at 80%.
- **NFR-SEC-02:** public resume uploads enforce configured size/type/magic-byte checks and use random shard-independent object keys; downloads are authorized and short-lived.

Every functional requirement must map to at least one acceptance test or documented manual demonstration. Keep a traceability table in `docs/evaluation.md` mapping `FR/NFR ID → implementation module → automated test/demo → evidence`.


### Acceptance traceability additions

Every acceptance line in §34 is tagged or cross-referenced to one or more `FR-*`/`NFR-*` IDs in `docs/evaluation.md`. At minimum, the following invariants are mandatory:

| Invariant | Requirement IDs | Pass/fail evidence |
|---|---|---|
| Gate closes, drains fenced writes and rejects new writes | NFR-MIG-01, NFR-MIG-02 | Integration test for gate acknowledgement, in-flight drain and `503 + Retry-After` |
| Stale writer cannot commit after cutover | NFR-MIG-02 | Paused-writer test across gate/cutover |
| All shard writes use fenced ShardRouter wrapper | NFR-MIG-02, NFR-MIG-04 | Gate-blocking integration test plus CI/lint direct-pool-access rule |
| Fence overhead is measured honestly | NFR-EVAL-01, NFR-MIG-04 | Three warmed runs against isolated benchmark-only control; report percentiles and deltas |
| Manifest complete and every employee table has non-null bucket | NFR-DATA-01, NFR-MIG-03 | Schema/manifest CI check and all-table fixture migration |
| Candidate domain remains on `candidate-v1` shards 1–3 | NFR-CAND-01, NFR-MIG-03 | Routing test confirms candidate map does not target `shard-4` in v1 |
| Active-map-owned bucket filtering prevents double counts | NFR-DATA-02 | Counts before and after cutover match before cleanup |
| Ring inputs and materialized map deterministic | NFR-CH-01 | Golden vectors and map-equality test |
| Rollback only before first accepted post-resume write | NFR-MIG-01 | Failed read-only smoke test reverts while gate remains closed |
| Invitation retries and reconciliation are idempotent | FR-01, NFR-CAT-01 | Concurrent invitation and simulated-crash recovery tests |
| Upload type/size/key validation | NFR-SEC-02 | Oversize, invalid declared type, magic-byte mismatch and object-key tests |
| Outbox order, idempotency, dead-letter and rebuild | NFR-OUTBOX-01 | Out-of-order replay and deliberately lost projection-event recovery |
| Lease expiry/catalog outage cannot duplicate IDs | NFR-ID-01, NFR-CAT-02 | Multi-process and catalog-outage tests |
| Placement table matches actual schema ownership | NFR-DATA-01, NFR-CAT-01 | Schema inventory/manifest CI and failure-path tests |
| Phase dependencies are satisfiable | FR-01, NFR-PORT-01 | Walking skeleton and phase exit criteria |
| Leave fallbacks prevent deadlock/self-approval | FR-07, NFR-SEC-01 | No-manager, HR/Admin requester, deactivated approver and self-approval tests |
| KV TTL/atomic operation semantics | NFR-KV-01, NFR-RL-01 | TTL expiry and concurrent atomic token-bucket tests |
| Status/short-link enumeration is bounded | NFR-RL-01, NFR-URL-01 | Rate-limit tests for `/s/:code` and `/application-status/:token` |
| Payroll retry after worker kill creates no duplicate rows | FR-08, NFR-QUEUE-01 | Kill/retry test and unique employee-period assertion |
| Catalog outage uses locally evaluated process deadline without per-write catalog dependency | NFR-CAT-02, NFR-MIG-02 | Outage test before/after registration deadline and lease safety margin |
| Per-shard durable gate survives migrator/catalog interruption | NFR-MIG-01, NFR-MIG-02 | Crash migrator after gate persistence; verify all gated shards reject writes until explicit resume/abort |
| Shard-local audit atomicity and idempotent catalog projection | NFR-AUDIT-01, NFR-OUTBOX-01 | Transaction rollback, catalog outage, retry/replay and duplicate-event tests |
| Catalog control-plane audit atomicity | NFR-AUDIT-01, NFR-SEC-01 | Force audit insert failure and assert control-plane mutation does not commit |
| Invitation excludes salary; salary is written after employee creation | FR-01, NFR-DATA-01 | Schema/payload validation and ownership integration test |
| Catalog and standby configuration are explicit and do not imply activation | NFR-CAT-01, NFR-MIG-01 | Startup validation and server-side endpoint allow-list test |

# 40B. Database Migrations and Connection Budget

- All schema changes are versioned and repeatably applied to each PostgreSQL shard.
- Startup/deployment verifies shard migration versions and fails clearly if required migrations are missing; avoid multiple API replicas racing to apply migrations at startup.
- Use one migration runner/job as the migration owner.
- Each shard has a configured bounded pool. Calculate maximum potential connections as `(API replicas × pools per API × per-pool maximum) + worker pools + migration/admin connections`. Set pool sizes based on PostgreSQL limits and observed concurrency, not arbitrary defaults.
- Use connection timeouts, query timeouts where appropriate, and expose pool saturation metrics.

# 40C. Locked Decisions and Remaining Configuration Values

The architecture decisions below are locked for v2.5. Remaining values are configuration details to measure or record before final evaluation; they are not permission to change the architecture silently:

1. Snowflake bit allocation is fixed; test worker-ID lease duration/renewal against maximum worker lifetime and record the lease timing/reclaim rules in `docs/decisions.md`.
2. Recruitment routing is fixed: candidates and their applications route by `candidate_id`; job postings live in the global recruitment catalog. Job-specific applicant lists use bounded scatter-gather.
3. Autocomplete v1 scope is `org` employee directory and `public-jobs`; use Redis sorted-set prefix caches. Ranking prioritizes exact/prefix match, then a stable relevance signal and deterministic tie-breaker. Record K, maximum prefix length, TTL and ranking weights before final benchmark runs.
4. Select low/medium/high workload sizes and numeric demo targets according to the single protocol in §20.5; results must never be invented.
5. Minimum tested laptop RAM/CPU and Compose profile footprint must be measured and recorded, not guessed.
6. Payroll demonstration formula is fixed in Section 11A; configurable PF/tax percentages and example salary fixtures must be recorded in `docs/decisions.md` and labelled as illustrative, not legally compliant.
7. Candidate-status links use a cryptographically random, high-entropy token, store only a token hash where practical, support expiry/revocation and expose only a minimal status summary. The exact token TTL is a configuration decision to document before release.
8. Consistent hashing is integrated into ShardRouter bucket-to-shard placement. The report must separately report ring remapping and actual copied/verified records during the controlled shard migration; neither metric substitutes for the other.
9. The fixed v1 bucket count is 256. The hash algorithm/input encoding and ring-point definitions are fixed in §9.2; record virtual-node count `V`, write-gate polling/heartbeat timeouts, lease TTL/heartbeat/safety margin, access-token TTL, invitation reservation expiry, candidate-status token TTL, upload-size limit, autocomplete K/prefix cap/TTL and Redis memory budget in `docs/decisions.md` before release or final evaluation. All processes must use identical ring configuration.

# 40D. Decision Log

Create and commit `docs/decisions.md` before implementation begins. It must record date, context, chosen option, alternatives considered, consequences and tests. Before Phase 1a code relies on them, record the initial values for ring virtual-node count `V`, process-registry heartbeat/expiry/safety margin, worker-ID lease TTL/heartbeat/safety margin, gate polling/acknowledgement intervals and timeouts, and access-token TTL. The initial defaults and rationale are in the accompanying decisions log; change them only through a documented decision and rerun affected tests. Also record fixed bucket count/hash algorithm, shard migration protocol, catalog responsibilities, Redis key families/TTLs, queue abstraction, crawler provider, payroll rules, RBAC/registration, storage adapter, database tooling, workload pilot targets and AWS cost profile. Numeric performance targets are selected under §20.5 after the pilot and before final benchmark runs; configuration defaults are not benchmark results.

# 41. Final Product Vision

The final HRMS should feel like a real enterprise HR platform while simultaneously serving as a demonstrable system-design project.

The user experience should be simple:

```text
Public Landing Page
        ↓
     Login
        ↓
Role-based Dashboard
        ↓
Collapsible Sidebar
        ↓
HR Operations
```

The technical architecture should demonstrate scalability:

```text
Clients
   ↓
NGINX / ALB
   ↓
Multiple Express API replicas
   ├── Rate limiter
   ├── KvStore / autocomplete
   ├── Unique ID generator
   └── ShardRouter
        └── Versioned consistent-hash ring
             ├── PostgreSQL shards 1–3 (active)
             ├── PostgreSQL shard 4 (pre-provisioned standby)
             └── pg-catalog (identity, directory, routing maps,
                             migration state, leases, process registry)

API / Worker / Outbox Dispatcher
   └── Enforced write fence + transactional outbox
        └── redis-queue / BullMQ → Background workers
             ├── Payroll
             ├── Notifications
             ├── Crawler
             └── Reports

redis-kv: sessions, rate limits, cache and autocomplete
Shared files: MinIO locally / S3 in optional AWS deployment
Observability: Prometheus + Grafana
Evaluation: k6
```

The project therefore combines a complete HR workflow with explicit, measurable system-design mechanisms rather than presenting the eight prescribed components as unrelated mini-projects.


---

## 42. Review Protocol and Change Control (v2.4)

This PRD v2.4 is the current proposed baseline for independent review. A reviewer must classify findings as **Blocker**, **Important**, **Minor**, **Accepted trade-off**, or **Out of scope**. Every finding must cite the exact PRD section/requirement, describe a concrete failure or ambiguity, give a reproducible scenario, and propose the smallest implementable correction. Do not treat preference differences as defects.

A change is accepted only when it improves correctness, testability, assignment compliance or implementation feasibility enough to justify the cost. Any proposed architecture change must identify all impacted sections, code modules, migrations, tests, evaluation claims and phase dependencies. Do not silently change the chosen stack, shard ownership, consistent-hashing scope, ID strategy, Redis split, queue adapter or local-first constraint.

The reviewer must specifically verify that: (1) the shard router and `pg-catalog` have one unambiguous responsibility boundary; (2) consistent hashing is implemented in real database placement and paired with an enforceable write-fence and complete ownership manifest; (3) stale writers cannot commit after gate closure/cutover and rollback is limited to the pre-resume window; (4) ring remapping is distinguished from physical data movement; (5) all cross-database consistency paths have explicit ownership, idempotency and recovery; (6) every required HR workflow has UI/API/data/test coverage; (7) every new requirement has an acceptance line; (8) evaluation compares like with like and reports measured values only; and (9) optional AWS work cannot block the local working prototype. The reviewer should recommend no more than a small, ranked set of changes that materially reduce risk.


### v2.2 patch summary (retained history)

The v2.2 revision specifically addresses: B1 (write gate/live-process registry and stale-writer fence), B2 (mandatory ownership manifest and fixed candidate-domain placement), I1 (active-map bucket filters), I2 (deterministic hash/ring and materialized map), I3 (pre-resume rollback boundary), I4 (invitation recovery and upload validation), I5 (complete outbox contract), I6 (lease/catalog outage behavior), I7 (explicit placement/revocation), I8 (phase dependencies and shard admin route), I9 (acceptance traceability), I10 (leave approval fallbacks), and the stale wording/configuration items M1–M12. Any values explicitly designated for `docs/decisions.md` remain configuration values to be recorded before release or final evaluation; no benchmark result is asserted here.


### v2.3 Change Log (retained history)

| Finding | Sections changed | Resolution |
|---|---|---|
| N1 — process registry/catalog outage | §9.2, §22 Scenario J/K, §27, §34, §40A | Process registration is checked locally from the last successful heartbeat and fails closed at a conservative deadline. Per-shard transaction fences and durable gate markers enforce migration independently of per-write catalog access; gates remain closed through catalog/migrator interruption. |
| N2 — audit atomicity | §12.1, §13, §31, §34, §40A | Shard-local actions commit a durable audit outbox event with the business mutation and project asynchronously/idempotently to the catalog. Catalog-owned control-plane mutations and audit rows commit together. |
| Stale architecture diagram | §16.1 | Added `pg-catalog`, active shards 1–3, standby shard 4, both Redis roles, worker/outbox dispatcher, MinIO and per-shard fencing. |
| Configuration keys | §27 | Clarified canonical catalog and standby endpoint names/roles; configuring standby does not activate it. |
| Invitation salary ownership | §6.5, §12.1, §33 Workflow 1, §34 | Salary is excluded from invitation/reservation payload and may be written only after employee creation on the owning shard. |

## v2.3 implementation guardrails (retained)

- No ordinary shard-local business write may require a synchronous `pg-catalog` query solely to validate process registration or acquire the migration fence. Local registration validity is bounded by a conservative deadline derived from the last successful heartbeat.
- No migration copy begins until every involved shard has a durable `GATED` marker and all registered live processes have acknowledged the gate epoch. No gate is reopened until the new map is acknowledged and gated smoke tests pass.
- Audit delivery may be delayed during catalog outage, but the authoritative shard must retain its durable audit event. Control-plane mutations remain fail-closed when their catalog audit cannot commit.
- `DATABASE_SHARD_4_URL` is configuration only; shard activation requires the explicit audited migration workflow.


## v2.4 Change Log

| Finding | Sections changed | Resolution |
|---|---|---|
| Phase 1a scope ambiguity | §36 | Defined the seeded Argon2id login, short-lived access token, no-Redis/no-refresh-session constraint, seed-populated directory projection and exact exit criterion. |
| Write-fence retrofit risk | §9.2, §34, §36, §40A | Added `shard_write_gate`, one fenced `ShardRouter` write wrapper, gate-blocking integration test and CI/lint rule against direct pool access outside documented exceptions. |
| Fence cost omitted from evaluation | §20.4, §21, §34, §40A | Added a fair benchmark-only control and required repeated p50/p95/p99, throughput/error-rate and absolute/percentage overhead reporting. |
| Pre-implementation decision baseline | §40C, §40D | Required `docs/decisions.md` before code and recorded initial ring, registry, ID lease, gate timing and access-token defaults. |

## v2.4 implementation guardrails

- Phase 1a must not pull in Redis, refresh sessions, full invitation workflows or the Phase 3 outbox projection. Its directory projection comes from the seed script.
- Every employee-shard business write must use the single fenced `ShardRouter` wrapper from Phase 1a onward. Domain repositories may not access shard pools directly.
- The no-fence benchmark control is test-only and must not be exposed as a production repository or application path.
- `docs/decisions.md` is created before implementation; selected configuration defaults are explicit and testable, while benchmark results and performance targets remain measured rather than invented.


## v2.5 Change Log

| Finding | Sections changed | Resolution |
|---|---|---|
| D-002 monotonic deadline | §9.2, §22 Scenario J, §40A, `docs/decisions.md` D-002 | Deadline is measured with the local monotonic clock from heartbeat request send time plus TTL, not catalog wall-clock expiry. |
| D-007 seed/migration routing | §9.2, §34, §36, `docs/decisions.md` D-007 | Seed/migration tools may bypass the normal write fence only where explicitly scoped, but must use the canonical ShardRouter routing function; seeded bucket/routing assertions are required. |
| Scenario J bounds | §22 Scenario J, §34, `docs/decisions.md` D-002/D-003 | Test registration write cutoff at approximately 20 s and independent ID-generation cutoff at approximately 45 s; the earlier registry bound limits business writes. |
| Pre-copy abort recovery | §9.2 step 3, §34, `docs/decisions.md` D-004 | A live migrator may compare-and-set only its own epoch markers back to `OPEN` if no copy or map change occurred; dead/ambiguous or post-copy failures require explicit recovery with gates closed. |
| Phase 1a rate limiter scope | §9.1, §36, §34 | Phase 1a login is local-only and has no rate limiter; Redis is Phase 1b and rate limiting is Phase 2. |

## v2.5 implementation guardrails

- Registry validity uses a local monotonic deadline anchored at heartbeat-request send time plus TTL, minus the configured safety margin; do not compare local wall-clock time to the catalog wall-clock expiry.
- Seed and migration exceptions bypass only the ordinary shared-write wrapper where necessary; routing and bucket calculation always use the canonical ShardRouter functions and the appropriate map.
- With the current defaults, registration validity limits eligible shard writes to about 20 seconds after the last successful heartbeat request send time. The independent worker-ID lease generation bound is about 45 seconds after its last successful renewal send time; it does not extend the business-write window.
- A live pre-copy abort may reopen only same-epoch markers it set, using compare-and-set, while the active map is unchanged. If the migrator is dead/ambiguous or copy/map change has begun, leave gates closed for explicit recovery.
- Phase 1a is local-only, seeded-login only, with no Redis, refresh sessions or rate limiter.
