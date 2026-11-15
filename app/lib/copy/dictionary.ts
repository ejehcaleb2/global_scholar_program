import en from "@/lib/copy/copy.json";

export const APP_LOCALE = "en" as const;

const {
  uiAuth: enAuth,
  uiOnboarding: enOnboarding,
  uiPublic: enPublic,
  uiLanding: enLanding,
  uiDashboard: enDashboard,
  uiCatalog: enCatalog,
  uiLearning: enLearning,
  uiResources: enResources,
  uiOpportunities: enOpportunities,
  uiMasterclasses: enMasterclasses,
  uiServices: enServices,
  uiNotFound: enNotFound,
  ...enAdmin
} = en.admin;

export const copy = {
  ...en,
  auth: enAuth,
  onboarding: enOnboarding,
  public: enPublic,
  landing: enLanding,
  dashboard: enDashboard,
  catalog: enCatalog,
  learning: enLearning,
  resources: enResources,
  opportunities: enOpportunities,
  masterclasses: enMasterclasses,
  services: enServices,
  notFound: enNotFound,
  admin: enAdmin,
};


export type CopyDictionary = typeof copy;
