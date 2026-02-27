import { defineConfig } from "prisma/config";
import path from "node:path";

const dbPath = path.resolve(__dirname, "../data/fhir_data.db");

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        url: `file:${dbPath}`,
    },
});
