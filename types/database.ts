export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: number;
          name: string;
          category: string | null;
          retail_price: number;
          image_url: string | null;
          source_url: string | null;
          volume_points: number;
          last_scraped_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          category?: string | null;
          retail_price: number;
          image_url?: string | null;
          source_url?: string | null;
          volume_points?: number;
          last_scraped_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          category?: string | null;
          retail_price?: number;
          image_url?: string | null;
          source_url?: string | null;
          volume_points?: number;
          last_scraped_at?: string;
        };
      };
      inventory: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          product_id: number | null;
          product_name: string;
          quantity: number;
          my_price: number;
          retail_price: number;
          profit: number;
          volume_points: number;
          comments: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          date?: string;
          product_id?: number | null;
          product_name: string;
          quantity: number;
          my_price: number;
          retail_price: number;
          volume_points?: number;
          comments?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          date?: string;
          product_id?: number | null;
          product_name?: string;
          quantity?: number;
          my_price?: number;
          retail_price?: number;
          volume_points?: number;
          comments?: string | null;
          created_at?: string;
        };
      };
      sales: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          customer_name: string;
          reference: string | null;
          product_id: number | null;
          product_name: string;
          quantity: number;
          my_price: number;
          retail_price: number;
          profit: number;
          volume_points: number;
          comments: string | null;
          payment_status: 'pending' | 'done';
          payment_method: 'online' | 'cash' | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          date?: string;
          customer_name: string;
          reference?: string | null;
          product_id?: number | null;
          product_name: string;
          quantity: number;
          my_price: number;
          retail_price: number;
          volume_points?: number;
          comments?: string | null;
          payment_status?: 'pending' | 'done';
          payment_method?: 'online' | 'cash' | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          date?: string;
          customer_name?: string;
          reference?: string | null;
          product_id?: number | null;
          product_name?: string;
          quantity?: number;
          my_price?: number;
          retail_price?: number;
          volume_points?: number;
          comments?: string | null;
          payment_status?: 'pending' | 'done';
          payment_method?: 'online' | 'cash' | null;
          created_at?: string;
        };
      };
      center_menu: {
        Row: {
          id: number;
          user_id: string;
          item_name: string;
          fixed_price: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          item_name: string;
          fixed_price: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          item_name?: string;
          fixed_price?: number;
          created_at?: string;
        };
      };
      center_sales: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          customer_name: string;
          reference: string | null;
          product_name: string;
          quantity: number;
          fixed_price: number;
          volume_points: number;
          comments: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          date?: string;
          customer_name: string;
          reference?: string | null;
          product_name: string;
          quantity?: number;
          fixed_price: number;
          volume_points?: number;
          comments?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          date?: string;
          customer_name?: string;
          reference?: string | null;
          product_name?: string;
          quantity?: number;
          fixed_price?: number;
          volume_points?: number;
          comments?: string | null;
          created_at?: string;
        };
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Inventory = Database['public']['Tables']['inventory']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type CenterMenu = Database['public']['Tables']['center_menu']['Row'];
export type CenterSale = Database['public']['Tables']['center_sales']['Row'];
