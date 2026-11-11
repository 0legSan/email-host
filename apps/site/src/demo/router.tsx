import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router"
import {
  parseMailRouteSearch,
  parseSettingsRouteSearch,
  parseAddAccountRouteSearch,
} from "@/lib/mail-route-state"
import { DemoMailApp } from "./mail-app"
import { embeddedDemo } from "./presentation"
import { demoStore } from "./store"

const rootRoute = createRootRoute({ component: Outlet })
const mailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail",
  validateSearch: parseMailRouteSearch,
  component: DemoMailApp,
})
const messageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/message/$messageId",
  validateSearch: parseMailRouteSearch,
  component: DemoMailApp,
})
export const demoRouter = createRouter({
  routeTree: rootRoute.addChildren([
    mailRoute,
    messageRoute,
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/mail/settings",
      validateSearch: parseSettingsRouteSearch,
      component: DemoMailApp,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/mail/message/$messageId/settings",
      validateSearch: parseSettingsRouteSearch,
      component: DemoMailApp,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/mail/settings/accounts/new",
      validateSearch: parseAddAccountRouteSearch,
      component: DemoMailApp,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/mail/message/$messageId/settings/accounts/new",
      validateSearch: parseAddAccountRouteSearch,
      component: DemoMailApp,
    }),
  ]),
  // Mail navigation stays inside the demo. Its URL can never become a real app route.
  history: createMemoryHistory({
    initialEntries: [
      embeddedDemo ? `/mail/message/${demoStore.messages[0].id}` : "/mail",
    ],
  }),
})
