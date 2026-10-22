import type { LiaraClient } from "./client";

type Json = Record<string, any>;

const priceOf = (entry: Json) =>
  Number(entry?.price ?? entry?.displayPrice ?? Number.MAX_SAFE_INTEGER) || Number.MAX_SAFE_INTEGER;

/** Cheapest available bundle plan key for a plan, e.g. projectBundlePlans["small-g2"]. */
function pickBundlePlan(bundles: Json | undefined, planID: string): string | undefined {
  const options = Object.entries<Json>(bundles?.[planID] ?? {})
    .filter(([, value]) => value?.available !== false)
    .sort((a, b) => priceOf(a[1]) - priceOf(b[1]));
  return options[0]?.[0];
}

export function pickAppPlan(me: Json, wanted?: string): { planID: string; bundlePlanID?: string } {
  const plans: Json = me.plans?.projects ?? {};
  let planID = wanted;
  if (!planID || !plans[planID] || plans[planID].available === false) {
    planID = Object.entries<Json>(plans)
      .filter(
        ([id, plan]) =>
          id !== "free" && id.includes("g2") && plan.available !== false && plan.region === "iran",
      )
      .sort((a, b) => priceOf(a[1]) - priceOf(b[1]))[0]?.[0];
  }
  if (!planID) throw new Error("No available app plan on this account.");
  return { planID, bundlePlanID: pickBundlePlan(me.plans?.projectBundlePlans, planID) };
}

const TYPE_ALIASES: Record<string, string> = {
  postgresql: "postgres",
  pg: "postgres",
  mongo: "mongodb",
  maria: "mariadb",
  elastic: "elasticsearch",
  sqlserver: "mssql",
};

const versionKey = (value: string) => value.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);

export function pickDatabase(
  me: Json,
  input: { type: string; version?: string; planID?: string },
): { type: string; version: string; planID: string; bundlePlanID?: string } {
  const type = TYPE_ALIASES[input.type.toLowerCase()] ?? input.type.toLowerCase();
  const versions: Json = me.databaseVersions ?? {};
  const known = Object.keys(versions);
  if (!versions[type]) {
    throw new Error(`Liara does not offer database type "${input.type}". Available types: ${known.join(", ")}.`);
  }
  const all: string[] = versions[type].map((entry: Json) => String(entry.value ?? entry));
  const stable = all.filter((value) => !/[a-z]/i.test(value));
  const pool = stable.length > 0 ? stable : all;
  const version =
    input.version && all.includes(input.version)
      ? input.version
      : [...pool].sort((a, b) => {
          const [x, y] = [versionKey(a), versionKey(b)];
          for (let i = 0; i < Math.max(x.length, y.length); i++) {
            if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
          }
          return 0;
        })[0];

  const plans: Json = me.plans?.databases ?? {};
  let planID = input.planID;
  const supports = (plan: Json) => !Array.isArray(plan.supports) || plan.supports.includes(type);
  if (!planID || !plans[planID] || plans[planID].available === false || !supports(plans[planID])) {
    planID = Object.entries<Json>(plans)
      .filter(
        ([id, plan]) =>
          id !== "free" && id.includes("g2") && plan.available !== false && supports(plan),
      )
      .sort((a, b) => priceOf(a[1]) - priceOf(b[1]))[0]?.[0];
  }
  if (!planID) throw new Error(`No available database plan supports ${type}.`);
  return { type, version, planID, bundlePlanID: pickBundlePlan(me.plans?.databaseBundlePlans, planID) };
}

/** First network of the account, creating one called "default" when there is none. */
export async function ensureNetwork(client: LiaraClient): Promise<{ _id: string; name: string }> {
  let networks = await client.listNetworks();
  if (networks.length === 0) {
    await client.createNetwork("default");
    networks = await client.listNetworks();
  }
  if (networks.length === 0) throw new Error("Could not create or find a Liara network.");
  return networks[0];
}
