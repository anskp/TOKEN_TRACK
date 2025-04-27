import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  sidebarOpen: false,
  notification: null,
  darkMode: false,
  currentView: 'default',
  dialogOpen: false,
  dialogContent: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },
    setNotification: (state, action) => {
      state.notification = action.payload;
    },
    clearNotification: (state) => {
      state.notification = null;
    },
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
    },
    setCurrentView: (state, action) => {
      state.currentView = action.payload;
    },
    openDialog: (state, action) => {
      state.dialogOpen = true;
      state.dialogContent = action.payload;
    },
    closeDialog: (state) => {
      state.dialogOpen = false;
      state.dialogContent = null;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  setNotification,
  clearNotification,
  toggleDarkMode,
  setCurrentView,
  openDialog,
  closeDialog,
} = uiSlice.actions;

export default uiSlice.reducer;
