import { configureStore } from "@reduxjs/toolkit";
import { publicApi } from "./api/publicApi";
import { adminApi } from "./api/adminApi";
import focusReducer from "./slices/focusSlice";

export const store = configureStore({
  reducer: {
    [publicApi.reducerPath]: publicApi.reducer,
    [adminApi.reducerPath]: adminApi.reducer,
    focus: focusReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(publicApi.middleware)
      .concat(adminApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
