import express from "express";

const app = express();
const PORT = Number(process.env.PORTAL_PORT ?? 4100);

const PEOPLE = [
  { id: "p01", name: "Nila Fernando", email: "nila.fernando@example.com", phone: "9810000001", skills: ["Node.js", "Postgres", "Redis"], exp: 4 },
  { id: "p02", name: "Ravi Shankar", email: "ravi.shankar@example.com", phone: "9810000002", skills: ["Python", "Django", "Postgres"], exp: 6 },
  { id: "p03", name: "Meera Nair", email: "meera.nair@example.com", phone: "9810000003", skills: ["React", "TypeScript", "CSS"], exp: 3 },
  { id: "p04", name: "Arjun Rao", email: "arjun.rao@example.com", phone: "9810000004", skills: ["Go", "Kubernetes", "gRPC"], exp: 5 },
  { id: "p05", name: "Divya Menon", email: "divya.menon@example.com", phone: "9810000005", skills: ["Java", "Spring", "Kafka"], exp: 7 },
  { id: "p06", name: "Kiran Patel", email: "kiran.patel@example.com", phone: "9810000006", skills: ["Node.js", "Express", "MongoDB"], exp: 2 },
  { id: "p07", name: "Nila Fernando", email: "nila.fernando@example.com", phone: "9810000001", skills: ["Node.js", "Postgres"], exp: 4 },
  { id: "p08", name: "Sara Thomas", email: "", phone: "9810000008", skills: ["Figma", "UX Research"], exp: 4 },
  { id: "p09", name: "Vikram Singh", email: "not-an-email", phone: "9810000009", skills: ["C++", "Embedded"], exp: 8 },
  { id: "p10", name: "Anu Krishnan", email: "anu.krishnan@example.com", phone: "", skills: [], exp: 1 },
  { id: "p11", name: "Broken Profile", email: "broken@example.com", phone: "9810000011", skills: ["Rust"], exp: 3, malformed: true },
  { id: "p12", name: "Slow Loris", email: "slow.loris@example.com", phone: "9810000012", skills: ["Elixir", "Phoenix"], exp: 5, slow: true },
];

const PER_PAGE = 5;

function layout(title, body) {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
}

function profileCard(p) {
  return `<article class="profile" data-id="${p.id}">
<h2 class="name">${p.name}</h2>
<p class="email">${p.email}</p>
<p class="phone">${p.phone}</p>
<p class="skills">${p.skills.join(", ")}</p>
<p class="exp">${p.exp} years</p>
<a class="detail" href="/profiles/${p.id}">View</a>
</article>`;
}

app.get("/", (_req, res) => {
  res.send(layout("Open Profiles", `<h1>Open candidate profiles</h1><p><a href="/listings?page=1">Browse listings</a></p>`));
});

app.get("/listings", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  if (req.query.slow === "1") await new Promise((r) => setTimeout(r, 2500));
  const total = Math.ceil(PEOPLE.length / PER_PAGE);
  if (page > total) return res.status(404).send(layout("Missing", "<p>No such page.</p>"));
  const slice = PEOPLE.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const next = page < total ? `<a rel="next" href="/listings?page=${page + 1}">Next</a>` : "";
  res.send(layout(`Listings ${page}`, `<h1>Profiles, page ${page}</h1>${slice.map(profileCard).join("")}<nav>${next}</nav>`));
});

app.get("/profiles/broken-500", (_req, res) => {
  res.status(500).send("boom");
});

app.get("/profiles/:id", async (req, res) => {
  const p = PEOPLE.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).send(layout("Missing", "<p>No such profile.</p>"));
  if (p.slow) await new Promise((r) => setTimeout(r, 2500));
  if (p.malformed) {
    return res.send(`<!DOCTYPE html><html><head><title>${p.name}</title><body><main><article class="profile" data-id="${p.id}"><h2 class="name">${p.name}<p class="email">${p.email}<div><span>unclosed tags everywhere`);
  }
  res.send(layout(p.name, `<article class="profile" data-id="${p.id}">
<h1 class="name">${p.name}</h1>
<dl><dt>Email</dt><dd class="email">${p.email}</dd><dt>Phone</dt><dd class="phone">${p.phone}</dd>
<dt>Skills</dt><dd class="skills">${p.skills.join(", ")}</dd><dt>Experience</dt><dd class="exp">${p.exp} years</dd></dl>
</article>`));
});

app.listen(PORT, () => console.log(`candidate-portal fixtures on :${PORT}`));
