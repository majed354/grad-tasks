// Validate private output through the application's actual import and merge path.
import fs from "node:fs/promises";
import { createServer } from "vite";
const filename = process.argv[2];
if (!filename)
  throw new Error(
    "Usage: node scripts/validate_harvest.mjs <private-import.grad.json>",
  );
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { readImport, planImport } = await server.ssrLoadModule("/src/io.ts");
  const { academicScope } = await server.ssrLoadModule("/src/academic.ts");
  const bytes = await fs.readFile(filename);
  const parsed = await readImport(new File([bytes], "harvest.grad.json"));
  const initial = planImport(parsed, {}, [], false);
  const repeated = planImport(parsed, {}, initial.students, false);
  if (
    initial.errors.length ||
    repeated.errors.length ||
    repeated.added !== 0 ||
    repeated.skipped !== initial.added
  )
    throw new Error(
      "Import failed or is not idempotent: " +
        JSON.stringify(initial.errors.slice(0, 10)),
    );
  const current = academicScope(initial.students, "1448");
  console.log(
    JSON.stringify({
      valid: true,
      bytes: bytes.length,
      students: initial.added,
      reimportAdded: repeated.added,
      reimportSkipped: repeated.skipped,
      currentYear: {
        available: current.available,
        period: current.period,
        sourceDate: current.sourceDate,
        enrollments: current.students.length,
        regular: current.students.filter((s) => s.status === "منتظم").length,
        masters: current.students.filter(
          (s) => s.status === "منتظم" && s.degree === "ماجستير",
        ).length,
        doctoral: current.students.filter(
          (s) => s.status === "منتظم" && s.degree === "دكتوراه",
        ).length,
      },
    }),
  );
} finally {
  await server.close();
}
