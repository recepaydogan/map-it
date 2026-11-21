import { inject } from "@vercel/analytics";
import { gaPageview, initGoogleAnalytics } from "../services/analytics/google-analytics";

inject();

// Static landing/SEO pages: one page_view per load is exactly right.
initGoogleAnalytics();
gaPageview();
