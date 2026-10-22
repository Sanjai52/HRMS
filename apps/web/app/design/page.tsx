import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  ChartLineUp,
  CheckCircle,
  MagnifyingGlass,
  Plus,
  Users,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  MetricCard,
  PageContainer,
  PageHeader,
  Select,
  SkeletonRows,
  StatusPill,
  Textarea,
  TextInput,
} from "../../components/ui";
import { Alert, ErrorState, LoadingState } from "../../components/feedback";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false },
};

const statuses = [
  "ACTIVE",
  "INACTIVE",
  "DEACTIVATED",
  "PRESENT",
  "LATE",
  "HALF_DAY",
  "ABSENT",
  "ON_LEAVE",
  "HOLIDAY",
  "REMOTE",
  "PENDING",
  "PENDING_MANAGER",
  "PENDING_HR",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "PAID",
  "FAILED",
  "PARTIAL_FAILED",
  "COMPLETED",
  "ABORTED",
  "DRAFT",
  "OPEN",
  "GATED",
  "CLOSED",
  "HIRED",
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "ASSESSMENT",
  "INTERVIEW",
  "SELECTED",
  "OFFER",
  "WITHDRAWN",
  "RESERVED",
  "RUNNING",
  "SCHEDULED",
  "UNKNOWN",
];

const contentPatterns = [
  {
    label: "Page load",
    title: "We couldn't load this page",
    body: "Check your connection and try again.",
    action: "Try again",
  },
  {
    label: "Session expired",
    title: "Your session has expired",
    body: "Sign in again to continue.",
    action: "Sign in",
  },
  {
    label: "Empty list",
    title: "No leave requests yet",
    body: "When someone applies, their request will appear here.",
    action: "Apply for leave",
  },
  {
    label: "Saved",
    title: "Changes saved",
    body: "Your profile is up to date.",
    action: "",
  },
];

function GallerySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} divider />
      <div className="p-5">{children}</div>
    </Card>
  );
}

export default function DesignSystemPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Design system"
        title="Primitives and states"
        description="The visual contract for HRMS: buttons, controls, cards, statuses, metrics, and the copy patterns that accompany every state."
        actions={
          <>
            <Button variant="outline">
              Secondary action
            </Button>
            <Button>
              Primary action
              <ArrowRight size={16} weight="regular" aria-hidden="true" />
            </Button>
          </>
        }
      />

      <div className="grid gap-6">
        <GallerySection
          title="Buttons"
          description="Six variants and four sizes share one 6px radius. Loading keeps the label visible; icon-only buttons require a label."
        >
          <div className="grid gap-5">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-secondary">Variants</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="quiet">Quiet (deprecated)</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-ink-secondary">Sizes</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="Search employees">
                  <MagnifyingGlass size={18} weight="regular" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-ink-secondary">States</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" loading>
                  Saving
                </Button>
                <Button variant="outline" disabled>
                  Disabled
                </Button>
                <Button variant="outline">
                  <Plus size={16} weight="regular" aria-hidden="true" />
                  Add employee
                </Button>
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </div>
            </div>
          </div>
        </GallerySection>

        <GallerySection
          title="Fields"
          description="Labels are 12px/500. Controls are 40px high with a 6px radius, a hint or error line, and an emerald focus ring."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="design-name" hint="Use the name on official records." required>
              <TextInput id="design-name" defaultValue="Priya Sharma" autoComplete="name" />
            </Field>
            <Field label="Work email" htmlFor="design-email" error="Enter a valid email address.">
              <TextInput id="design-email" type="email" defaultValue="priya@" invalid autoComplete="email" />
            </Field>
            <Field label="Employee number" htmlFor="design-employee-number" hint="Assigned by HR.">
              <TextInput id="design-employee-number" defaultValue="EMP-001" disabled />
            </Field>
            <Field label="Department" htmlFor="design-department">
              <Select id="design-department" defaultValue="engineering">
                <option value="engineering">Engineering</option>
                <option value="people">People operations</option>
                <option value="finance">Finance</option>
              </Select>
            </Field>
            <Field
              label="Notes"
              htmlFor="design-notes"
              hint="Visible to the approver."
              className="sm:col-span-2"
            >
              <Textarea
                id="design-notes"
                rows={3}
                defaultValue="Share context that helps the reviewer make a decision."
              />
            </Field>
          </div>
        </GallerySection>

        <GallerySection
          title="Cards and metrics"
          description="Cards use an 8px radius, a single border, and one card shadow. Metric values use tabular numerals."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Headcount"
              value="248"
              detail="Across 6 departments"
              trend="+12 this quarter"
              icon={<Users size={18} weight="regular" />}
            />
            <MetricCard
              label="Present today"
              value="231"
              detail="17 on leave or remote"
              icon={<CalendarCheck size={18} weight="regular" />}
            />
            <MetricCard
              label="Net payroll"
              value="₹48,500.00"
              detail="October 2026"
              icon={<Wallet size={18} weight="regular" />}
            />
            <MetricCard
              label="Pending approvals"
              value="3"
              detail="Nothing older than 2 days"
              trend="2 leave requests, 1 timesheet"
              icon={<ChartLineUp size={18} weight="regular" />}
              accent
            />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm font-semibold text-ink">Plain card</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                Cards have no default padding. Pages choose the spacing that fits their content.
              </p>
            </Card>
            <Card>
              <CardHeader
                title="Card header"
                description="With an optional action on the right."
                action={
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                }
                divider
              />
              <p className="p-5 text-[13px] leading-relaxed text-ink-secondary">
                The divider separates the heading from the card body.
              </p>
            </Card>
          </div>
        </GallerySection>

        <GallerySection
          title="Statuses"
          description="Five tones, each with a dot and an uppercase 11px label. Unknown values fall back to neutral."
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status="ACTIVE" />
            <StatusPill status="PENDING" />
            <StatusPill status="ABSENT" />
            <StatusPill status="ON_LEAVE" />
            <StatusPill status="CLOSED" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusPill key={status} status={status} />
            ))}
          </div>
        </GallerySection>

        <GallerySection
          title="Inline alerts"
          description="Danger uses role alert. Success, warning, and info use role status. Each alert names the outcome and the next step."
        >
          <div className="grid gap-3">
            <Alert tone="success" title="Changes saved">
              Your profile is up to date.
            </Alert>
            <Alert tone="info" title="Payroll closes on Friday">
              Submit any remaining adjustments before 5pm.
            </Alert>
            <Alert tone="warning" title="Some records are temporarily unavailable">
              Counts may be incomplete. Try again in a few minutes.
            </Alert>
            <Alert tone="danger" title="We couldn't save your changes">
              Your details were not changed. Try again.
            </Alert>
          </div>
        </GallerySection>

        <GallerySection
          title="Error, empty, and loading states"
          description="Page-level failures use ErrorState. Zero records use EmptyState. In-flight requests use skeletons."
        >
          <div className="grid gap-4">
            <ErrorState
              title="We couldn't load your team"
              body="Check your connection and try again."
              actionLabel="Try again"
              actionHref="/design"
              secondaryLabel="Back to dashboard"
              secondaryHref="/dashboard"
            />
            <EmptyState
              title="No leave requests yet"
              body="When someone applies, their request will appear here."
              action={
                <Button variant="outline" size="sm">
                  Apply for leave
                </Button>
              }
            />
            <LoadingState rows={3} />
            <div className="rounded-card border border-line bg-surface p-5 shadow-card">
              <p className="mb-3 text-xs font-medium text-ink-secondary">Table skeleton</p>
              <SkeletonRows n={3} cols={4} />
            </div>
          </div>
        </GallerySection>

        <GallerySection
          title="Content patterns"
          description="Approved copy for common states. Name the outcome first, then give the person a next step."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {contentPatterns.map((pattern) => (
              <div key={pattern.label} className="rounded-card border border-line bg-surface-muted p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} weight="regular" className="text-success" aria-hidden="true" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {pattern.label}
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{pattern.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{pattern.body}</p>
                {pattern.action && (
                  <p className="mt-2 text-[13px] font-medium text-primary">{pattern.action}</p>
                )}
              </div>
            ))}
          </div>
        </GallerySection>
      </div>
    </PageContainer>
  );
}
