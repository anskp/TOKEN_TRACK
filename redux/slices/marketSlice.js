import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks for market operations
export const fetchMarketOrders = createAsyncThunk(
  'market/fetchMarketOrders',
  async (filters = {}, { rejectWithValue }) => {
    try {
      // Convert filters to query string
      const queryParams = new URLSearchParams(filters).toString();
      const url = `/api/market/orders${queryParams ? `?${queryParams}` : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch market orders');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createMarketOrder = createAsyncThunk(
  'market/createMarketOrder',
  async (orderData, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/market/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create order');
      }
      
      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  orders: [],
  userOrders: [],
  selectedOrder: null,
  orderBook: {
    buy: [],
    sell: [],
  },
  loading: false,
  error: null,
};

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setSelectedOrder: (state, action) => {
      state.selectedOrder = action.payload;
    },
    cancelOrder: (state, action) => {
      // Update the status of a canceled order
      const orderId = action.payload;
      state.orders = state.orders.map(order => 
        order.id === orderId ? { ...order, status: 'cancelled' } : order
      );
      state.userOrders = state.userOrders.map(order => 
        order.id === orderId ? { ...order, status: 'cancelled' } : order
      );
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchMarketOrders
      .addCase(fetchMarketOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMarketOrders.fulfilled, (state, action) => {
        state.loading = false;
        state.orders = action.payload;
        
        // Update order book
        const buyOrders = action.payload
          .filter(order => order.order_type === 'buy' && order.status !== 'cancelled')
          .sort((a, b) => b.price - a.price); // Sort buy orders highest price first
        
        const sellOrders = action.payload
          .filter(order => order.order_type === 'sell' && order.status !== 'cancelled')
          .sort((a, b) => a.price - b.price); // Sort sell orders lowest price first
        
        state.orderBook = {
          buy: buyOrders,
          sell: sellOrders,
        };
      })
      .addCase(fetchMarketOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Handle createMarketOrder
      .addCase(createMarketOrder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createMarketOrder.fulfilled, (state, action) => {
        state.loading = false;
        // Add the new order to the orders list and user orders
        state.orders.push(action.payload);
        state.userOrders.push(action.payload);
        
        // Update order book
        if (action.payload.order_type === 'buy') {
          state.orderBook.buy.push(action.payload);
          state.orderBook.buy.sort((a, b) => b.price - a.price);
        } else {
          state.orderBook.sell.push(action.payload);
          state.orderBook.sell.sort((a, b) => a.price - b.price);
        }
      })
      .addCase(createMarketOrder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setSelectedOrder, cancelOrder } = marketSlice.actions;

export default marketSlice.reducer;
