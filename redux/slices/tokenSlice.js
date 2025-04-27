import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks for token operations
export const fetchTokens = createAsyncThunk(
  'tokens/fetchTokens',
  async (filters = {}, { rejectWithValue }) => {
    try {
      // Convert filters to query string
      const queryParams = new URLSearchParams(filters).toString();
      const url = `/api/tokens${queryParams ? `?${queryParams}` : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch tokens');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchTokenDetails = createAsyncThunk(
  'tokens/fetchTokenDetails',
  async (tokenId, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/tokens/${tokenId}`);
      if (!response.ok) throw new Error('Failed to fetch token details');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  tokens: [],
  selectedToken: null,
  loading: false,
  error: null,
  filters: {
    assetType: null,
    minPrice: null,
    maxPrice: null,
    status: 'live', // Default to only showing live tokens
  },
};

const tokenSlice = createSlice({
  name: 'tokens',
  initialState,
  reducers: {
    setSelectedToken: (state, action) => {
      state.selectedToken = action.payload;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = { ...initialState.filters };
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchTokens
      .addCase(fetchTokens.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTokens.fulfilled, (state, action) => {
        state.loading = false;
        state.tokens = action.payload;
      })
      .addCase(fetchTokens.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Handle fetchTokenDetails
      .addCase(fetchTokenDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTokenDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedToken = action.payload;
      })
      .addCase(fetchTokenDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setSelectedToken, setFilters, clearFilters } = tokenSlice.actions;

export default tokenSlice.reducer;
