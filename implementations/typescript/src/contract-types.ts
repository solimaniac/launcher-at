// Generated from contracts/v1/flow.json. Run npm run generate:contracts.
export type LoginMode = "signin" | "signup" | "both"
export type View = "intro" | "signin" | "providers" | "pending" | "error" | "complete"
export type Intent = "signin" | "signup"
export type ErrorKey = "errors.identifier" | "errors.service" | "errors.provider" | "errors.initialization" | "errors.unsupportedProvider" | "errors.authorization" | "errors.cancelled" | "errors.callback"
