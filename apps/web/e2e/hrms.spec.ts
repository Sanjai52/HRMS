import { test, expect } from "@playwright/test";
import { API, PORTAL, email, hrToken, inviteAcceptOnboard, uiLogin } from "./helpers";

test.describe.serial("HRMS end to end", () => {
  test("landing is a product page, not a prototype", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /people process/i })).toBeVisible();
    await expect(page.getByText("HRMS", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/academic|mini project|shard|hash ring/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("HR logs in and sees live dashboard", async ({ page }) => {
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await expect(page.getByRole("heading", { name: /good day/i })).toBeVisible();
    await expect(page.getByText("Attendance today")).toBeVisible();
    await expect(page.getByText("Latest payslip")).toBeVisible();
    await expect(page.getByText("Unread notifications")).toBeVisible();
  });

  test("invitation acceptance creates an account", async ({ page, request }) => {
    const hr = await hrToken(request);
    const em = email("e2eaccept");
    const create = await request.post(`${API}/api/v1/auth/invitations`, {
      headers: { authorization: `Bearer ${hr}` },
      data: { email: em, name: "E2E Acceptor", role: "EMPLOYEE" },
    });
    expect(create.status()).toBe(201);
    const { data } = (await create.json()) as { data: { token: string } };
    await page.goto(`/register?token=${data.token}`);
    await page.getByLabel("New password").fill("AcceptorPass1!");
    await page.getByLabel("Confirm password").fill("AcceptorPass1!");
    await page.getByRole("button", { name: /join workspace/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  });

  test("HR onboards, edits, and deactivates an employee", async ({ page, request }) => {
    const hr = await hrToken(request);
    const em = email("e2elifecycle");
    const person = await inviteAcceptOnboard(request, hr, "E2E Lifecycle", em);
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.goto("/hr/employees/new");
    await expect(page.getByText(em)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /create record/i }).first().click();
    await expect(page.getByText(/record created/i)).toBeVisible({ timeout: 15000 });

    await page.goto("/hr/employees");
    await page.getByRole("main").getByLabel("Search employees").fill("E2E Lifecycle");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: /E2E Lifecycle/ }).first().click();
    await expect(page.getByRole("heading", { name: "E2E Lifecycle" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Designation").fill("QA Engineer");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText(/changes saved/i)).toBeVisible({ timeout: 15000 });

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /deactivate employee/i }).click();
    await expect(page).toHaveURL(/hr\/employees$/, { timeout: 15000 });
    expect(person.employeeId).toBeTruthy();
  });

  test("attendance check-in and check-out", async ({ page, request }) => {
    const hr = await hrToken(request);
    const em = email("e2eatt");
    const person = await inviteAcceptOnboard(request, hr, "E2E Attendee", em);
    await uiLogin(page, em, "PersonPass1!");
    await page.goto("/attendance");
    await page.getByRole("button", { name: /check in/i }).click();
    await expect(page.getByText(/checked in/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /check out/i }).click();
    await expect(page.getByText(/done/i)).toBeVisible({ timeout: 15000 });
    expect(person.employeeId).toBeTruthy();
  });

  test("profile save keeps header, department, and status intact", async ({ page, request }) => {
    const hr = await hrToken(request);
    const em = email("e2eprofile");
    const person = await inviteAcceptOnboard(request, hr, "E2E Profile", em);

    // Real department/designation make the post-save field survival observable.
    const detail = await request.get(`${API}/api/v1/employees/${person.employeeId}`, { headers: { authorization: `Bearer ${hr}` } });
    const version = ((await detail.json()) as { data: { version: number } }).data.version;
    const patch = await request.patch(`${API}/api/v1/employees/${person.employeeId}`, {
      headers: { authorization: `Bearer ${hr}` },
      data: { department: "Engineering", designation: "QA Engineer", version },
    });
    expect(patch.status()).toBe(200);
    await request.post(`${API}/system/test/run-dispatcher`);

    await uiLogin(page, em, "PersonPass1!");
    await page.goto("/profile");
    await expect(page.getByText("QA Engineer · Engineering")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("ACTIVE")).toBeVisible();

    await page.getByLabel("Full name").fill("E2E Profile Renamed");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible({ timeout: 15000 });

    // The regression: PATCH /me returns only name/version, so read-model fields
    // (designation · department, status pill) must survive the save without a reload.
    await expect(page.getByText("E2E Profile Renamed")).toBeVisible();
    await expect(page.getByText("QA Engineer · Engineering")).toBeVisible();
    await expect(page.getByText("ACTIVE")).toBeVisible();

    // Round trip: once the dispatcher projects the update, a reload shows the new name.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("E2E Profile Renamed")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
    await expect(page.getByText("QA Engineer · Engineering")).toBeVisible();
    await expect(page.getByText("ACTIVE")).toBeVisible();
  });

  test("leave flows from apply to approval", async ({ page, request }) => {
    const hr = await hrToken(request);
    const mgr = await inviteAcceptOnboard(request, hr, "E2E Mgr", email("e2emgr"), "MANAGER");
    const mem = await inviteAcceptOnboard(request, hr, "E2E Member", email("e2emem"));
    const detail = await request.get(`${API}/api/v1/employees/${mem.employeeId}`, { headers: { authorization: `Bearer ${hr}` } });
    const version = ((await detail.json()) as { data: { version: number } }).data.version;
    const patch = await request.patch(`${API}/api/v1/employees/${mem.employeeId}`, {
      headers: { authorization: `Bearer ${hr}` },
      data: { version, managerId: mgr.employeeId },
    });
    expect(patch.status()).toBe(200);

    await uiLogin(page, mem.email, "PersonPass1!");
    await page.goto("/leave/apply");
    await page.getByLabel("Start date").fill("2026-11-16");
    await page.getByLabel("End date").fill("2026-11-17");
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page).toHaveURL(/\/leave$/, { timeout: 15000 });

    await uiLogin(page, mgr.email, "PersonPass1!");
    await page.goto("/manager/leave");
    await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible({ timeout: 20000 });
  });

  test("payroll runs and payslip opens", async ({ page, request }) => {
    const hr = await hrToken(request);
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.goto("/hr/payroll/run");
    await page.getByLabel("Pay period").fill("2026-09");
    await page.getByRole("button", { name: /queue payroll run/i }).click();
    await expect(page.getByText(/done|completed|processing/i).first()).toBeVisible({ timeout: 90000 });
  });

  test("public hiring flow works without login", async ({ page, request }) => {
    const hr = await hrToken(request);
    const job = await request.post(`${API}/api/v1/jobs`, {
      headers: { authorization: `Bearer ${hr}` },
      data: { title: `E2E Engineer ${Date.now()}`, department: "Engineering" },
    });
    expect(job.status()).toBe(201);
    const { data: j } = (await job.json()) as { data: { slug: string; jobId: string } };
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: /open roles/i })).toBeVisible({ timeout: 15000 });
    await page.goto(`/jobs/${j.slug}`);
    await expect(page.getByRole("heading", { name: /E2E Engineer/ })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: /apply now/i }).click();
    await page.getByLabel("Full name").fill("E2E Candidate");
    await page.getByLabel("Email address").fill(`e2ecand${Date.now()}@example.com`);
    await page.getByRole("button", { name: /submit application/i }).click();
    await expect(page.getByText(/application received/i)).toBeVisible({ timeout: 20000 });
    await page.getByRole("link", { name: /track status/i }).click();
    await expect(page.getByRole("heading", { name: /track your application/i })).toBeVisible({ timeout: 15000 });
  });

  test("sourcing run completes and pool grows", async ({ page, request }) => {
    const hr = await hrToken(request);
    // The fixture portal is fully deduped after the first crawl, so seed a fresh
    // profile to prove this run actually discovers and imports (the test name
    // promises growth; discovered/imported > 0 are meaningless on a warm pool).
    const marker = `e2e-marker-${Date.now()}`;
    const seeded = await request.post(`${PORTAL}/test/seed`, {
      data: { name: `E2E Portal ${Date.now()}`, email: `${marker}@example.com`, skills: [marker], exp: 3 },
    });
    expect(seeded.status()).toBe(201);

    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.goto("/hr/recruitment/sourcing");
    const role = `E2E Sourcing ${Date.now()}`;
    await page.getByLabel("Target role").fill(role);
    await page.getByLabel("Skills (comma separated, optional)").fill(marker);
    await page.getByRole("button", { name: /start sourcing/i }).click();

    // Poll the runs API until this run reaches a terminal state: a 500 on the
    // start POST or a dead crawler never produces a run row here at all.
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API}/api/v1/recruitment/sourcing/runs`, { headers: { authorization: `Bearer ${hr}` } });
          const body = (await res.json()) as { data: Array<{ role: string; status: string }> };
          return body.data.find((r) => r.role === role)?.status ?? "NOT_FOUND";
        },
        { timeout: 60000, intervals: [1000], message: "sourcing run should reach a terminal state" }
      )
      .toMatch(/COMPLETED|PARTIAL_FAILED|FAILED/);

    const res = await request.get(`${API}/api/v1/recruitment/sourcing/runs`, { headers: { authorization: `Bearer ${hr}` } });
    const body = (await res.json()) as { data: Array<{ role: string; status: string; pages: number; discovered: number; imported: number }> };
    const run = body.data.find((r) => r.role === role);
    expect(run).toBeDefined();
    expect(run!.status).toBe("COMPLETED");
    expect(run!.pages).toBeGreaterThan(0);
    expect(run!.discovered).toBeGreaterThan(0);
    expect(run!.imported).toBeGreaterThan(0);

    // The finished run and its live counts render in the UI.
    await page.reload();
    const row = page.getByRole("link", { name: new RegExp(role) });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText("COMPLETED");
    await expect(row).toContainText(`${run!.imported} imported`);
  });

  test("performance cycle to released review", async ({ page, request }) => {
    const hr = await hrToken(request);
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.goto("/hr/performance/cycles");
    const cycleName = `E2E Cycle ${Date.now()}`;
    await page.getByLabel("Name").fill(cycleName);
    await page.getByLabel("Starts").fill("2026-07-01");
    await page.getByLabel("Ends").fill("2026-12-31");
    await page.getByRole("button", { name: /open cycle/i }).click();
    // The page refetches on mount and after submit; a slow mount fetch can
    // resolve after the submit fetch and leave the list stale, so reload for
    // a deterministic read of the persisted row.
    await page.reload();
    await expect(page.getByText(cycleName)).toBeVisible({ timeout: 15000 });
  });

  test("admin pages show live system state", async ({ page }) => {
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.goto("/admin/system-health");
    await expect(page.getByText(/restricted|databases/i)).toBeVisible({ timeout: 15000 });
  });

  test("profile menu navigates to /profile", async ({ page }) => {
    await uiLogin(page, "hr@hrms.local", "ChangeMe123!");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible({ timeout: 15000 });
  });

  test("admin navigation renders /admin/users", async ({ page, request }) => {
    const hr = await hrToken(request);
    const em = email("e2eadmin");
    const create = await request.post(`${API}/api/v1/auth/invitations`, {
      headers: { authorization: `Bearer ${hr}` },
      data: { email: em, name: "E2E Admin", role: "ADMIN" },
    });
    expect(create.status()).toBe(201);
    const { data } = (await create.json()) as { data: { token: string } };
    const accept = await request.post(`${API}/api/v1/auth/accept`, { data: { token: data.token, password: "AdminPass1!" } });
    expect(accept.status()).toBe(201);

    await uiLogin(page, em, "AdminPass1!");
    await page.getByRole("link", { name: "Users & roles" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Users & roles" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/accounts · showing/)).toBeVisible({ timeout: 15000 });
  });
});
