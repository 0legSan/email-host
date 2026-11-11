/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as accountsInternal from "../accountsInternal.js";
import type * as authInternal from "../authInternal.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_mailListEntryFlags from "../lib/mailListEntryFlags.js";
import type * as mail from "../mail.js";
import type * as mailConsistency from "../mailConsistency.js";
import type * as mailInternal from "../mailInternal.js";
import type * as mailSearch from "../mailSearch.js";
import type * as migrationInternal from "../migrationInternal.js";
import type * as outboundInternal from "../outboundInternal.js";
import type * as preferences from "../preferences.js";
import type * as preferencesInternal from "../preferencesInternal.js";
import type * as profiles from "../profiles.js";
import type * as profilesInternal from "../profilesInternal.js";
import type * as pushInternal from "../pushInternal.js";
import type * as session from "../session.js";
import type * as system from "../system.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  accountsInternal: typeof accountsInternal;
  authInternal: typeof authInternal;
  "lib/auth": typeof lib_auth;
  "lib/mailListEntryFlags": typeof lib_mailListEntryFlags;
  mail: typeof mail;
  mailConsistency: typeof mailConsistency;
  mailInternal: typeof mailInternal;
  mailSearch: typeof mailSearch;
  migrationInternal: typeof migrationInternal;
  outboundInternal: typeof outboundInternal;
  preferences: typeof preferences;
  preferencesInternal: typeof preferencesInternal;
  profiles: typeof profiles;
  profilesInternal: typeof profilesInternal;
  pushInternal: typeof pushInternal;
  session: typeof session;
  system: typeof system;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
