import * as repo from "../../src/lib/repo";
import * as sync from "../../src/lib/sync";
import * as db from "../../src/lib/db";
import { cloud, hooks } from "./fake-supabase";
(window as any).__t = { repo, sync, db, cloud, hooks };
