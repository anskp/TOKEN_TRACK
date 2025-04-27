import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import tokenReducer from './slices/tokenSlice';
import marketReducer from './slices/marketSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tokens: tokenReducer,
    market: marketReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Allows non-serializable values in state
    }),
});
