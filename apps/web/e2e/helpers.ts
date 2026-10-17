import { APIRequestContext, Page, expect } from "@playwright/test";

export const API = process.env.API_BASE ?? "http://localhost:4000";
export const email = (n: string) => `${n}${Date.now()}@hrms.local`;

export async function apiLogin(request: APIRequestContext, em: string, pw: string): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/login`, { data: { email: em, password: pw } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.token as string;
}

export async function hrToken(request: APIRequestContext): Promise<string> {
  return apiLogin(request, "hr@hrms.local", "ChangeMe123!");
}

export async function inviteAcceptOnboard(
  request: APIRequestContext,
  hr: string,
  name: string,
  em: string,
  role = "EMPLOYEE"
): Promise<{ token: string; employeeId: string; email: string }> {
  const create = await request.post(`${API}/api/v1/auth/invitations`, {
    headers: { authorization: `Bearer ${hr}` },
    data: { email: em, name, role },
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as { data: { invitationId: string; token: string } };
  const accept = await request.post(`${API}/api/v1/auth/accept`, { data: { token: created.data.token, password: "PersonPass1!" } });
  expect(accept.status()).toBe(201);
  const accepted = (await accept.json()) as { data: { token: string } };
  const ob = await request.post(`${API}/api/v1/employees/onboard`, {
    headers: { authorization: `Bearer ${hr}` },
    data: { invitationId: created.data.invitationId },
  });
  expect(ob.status()).toBe(201);
  await request.post(`${API}/system/test/run-dispatcher`);
  const onboarded = (await ob.json()) as { data: { employeeId: string } };
  return { token: accepted.data.token, employeeId: onboarded.data.employeeId, email: em };
}

export async function uiLogin(page: Page, em: string, pw: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(em);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}
