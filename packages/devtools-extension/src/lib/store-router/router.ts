import { Route } from './route';
import { RouteConfig, RouterConfig } from './router-config';
import {
  Action,
  combineReactions,
  createActions,
  createReaction,
  createReducer,
  createSelector,
  createSliceSelector,
  filterActions,
  on,
  Selector,
  Slice,
  Store,
} from '@lib/store';
import { createUrl, Url } from './url';
import { concatMap, EMPTY, of } from 'rxjs';
import { RouteMatcher } from './route-matcher';

export interface RouterState<DATA> {
  url: Url;
  routes: Route<DATA>[];
}

export interface Router<DATA, METADATA> {
  url: Selector<any, Url>;
  routes: Selector<any, Route<DATA>[]>;
  navigate(url: Url): Action<{ url: Url }>;
  getRouteConfig(id: number): RouteConfig<DATA, METADATA> | undefined;
}

export function createRouter<SLICE extends string, DATA, METADATA>(
  routerSlice: SLICE,
  routerConfig: RouterConfig<DATA, METADATA>
) {
  type RouterSlice = Slice<SLICE, RouterState<DATA>>;

  const routeMatcher = new RouteMatcher<DATA, METADATA>(
    routerConfig.routes ?? []
  );
  console.log({ routeMatcher });

  const routerActions = createActions<{
    Navigate: { url: Url };
    InterceptLeaveRedirect: { url: Url };
    InterceptEnterRedirect: { url: Url };
    NavigationComplete: { url: Url; routes: Route<DATA>[] };
  }>(routerSlice);

  const routerReducer = createReducer(routerSlice, {
    url: createUrl(),
    routes: [],
  } as RouterState<DATA>).add(
    routerActions.NavigationComplete,
    (state, action) => {
      state.url = action.payload.url;
      state.routes = action.payload.routes;
    }
  );

  const routerSelector = createSliceSelector(routerReducer);

  const routerSelectors = {
    state: routerSelector,
    url: createSelector(
      { state: routerSelector },
      ({ state }) => state.url
    ) as Selector<RouterSlice, RouterState<DATA>['url']>,
    routes: createSelector(
      { state: routerSelector },
      ({ state }) => state.routes
    ) as Selector<RouterSlice, RouterState<DATA>['routes']>,
  };

  const routerReaction = combineReactions()
    .add(
      createReaction(
        (action$, store) =>
          action$.pipe(
            filterActions([
              routerActions.Navigate,
              routerActions.InterceptLeaveRedirect,
              routerActions.InterceptEnterRedirect,
            ]),
            concatMap((action) => {
              const prevUrl = store.get(routerSelectors.url);
              const prevRoutes = store.get(routerSelectors.routes);
              const dispatchOnLeave: Action[] = [];

              for (const route of prevRoutes) {
                const routeConfig = routeMatcher.getRouteConfig(
                  route.routeConfigId
                );
                if (routeConfig?.interceptLeave) {
                  const result = routeConfig.interceptLeave(
                    store,
                    prevUrl,
                    route
                  );
                  if (typeof result === 'boolean') {
                    if (!result) {
                      return EMPTY;
                    }
                  } else {
                    return of(
                      routerActions.InterceptLeaveRedirect({ url: result })
                    );
                  }
                }
                if (routeConfig?.dispatchOnLeave) {
                  dispatchOnLeave.push(
                    routeConfig.dispatchOnLeave(store, prevUrl, route)
                  );
                }
              }

              const nextUrl = action.payload.url;
              const nextRoutes = routeMatcher.match(action.payload.url.path);
              const dispatchOnEnter: Action[] = [];

              for (const route of nextRoutes) {
                const routeConfig = routeMatcher.getRouteConfig(
                  route.routeConfigId
                );
                if (routeConfig?.interceptEnter) {
                  const result = routeConfig.interceptEnter(
                    store,
                    prevUrl,
                    route
                  );
                  if (typeof result === 'boolean') {
                    if (!result) {
                      return EMPTY;
                    }
                  } else {
                    return of(
                      routerActions.InterceptEnterRedirect({ url: result })
                    );
                  }
                }
                if (routeConfig?.dispatchOnEnter) {
                  dispatchOnEnter.push(
                    routeConfig.dispatchOnEnter(store, prevUrl, route)
                  );
                }
              }

              return of(
                ...dispatchOnLeave,
                routerActions.NavigationComplete({
                  url: nextUrl,
                  routes: nextRoutes,
                }),
                ...dispatchOnEnter
              );
            })
          ),
        (store: Store<RouterSlice>) => store
      )
    )
    .add(
      createReaction(() => of(routerActions.Navigate({ url: createUrl() })))
    );

  const router: Router<DATA, METADATA> = {
    url: routerSelectors.url,
    routes: routerSelectors.routes,
    navigate(url: Url) {
      return routerActions.Navigate({ url });
    },
    getRouteConfig(id: number) {
      return routeMatcher.getRouteConfig(id);
    },
  };

  return {
    routerActions,
    routerSelectors,
    routerReducer,
    routerReaction,
    router,
  };
}
