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
          user_id: string;
          name: string;
          category: string | null;
          qty: string | null;
          retail_price: number;
          image_url: string | null;
          source_url: string | null;
          volume_points: number;
          last_scraped_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          name: string;
          category?: string | null;
          qty?: string | null;
          retail_price: number;
          image_url?: string | null;
          source_url?: string | null;
          volume_points?: number;
          last_scraped_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          name?: string;
          category?: string | null;
          qty?: string | null;
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
          section: string;
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
          section?: string;
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
          section?: string;
          created_at?: string;
        };
      };
      sales: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          customer_name: string;
          customer_phone: string | null;
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
          customer_phone?: string | null;
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
          customer_phone?: string | null;
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
          customer_phone: string | null;
          reference: string | null;
          product_name: string;
          quantity: number;
          my_price: number;
          fixed_price: number;
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
          customer_phone?: string | null;
          reference?: string | null;
          product_name: string;
          quantity?: number;
          my_price?: number;
          fixed_price: number;
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
          customer_phone?: string | null;
          reference?: string | null;
          product_name?: string;
          quantity?: number;
          my_price?: number;
          fixed_price?: number;
          volume_points?: number;
          comments?: string | null;
          payment_status?: 'pending' | 'done';
          payment_method?: 'online' | 'cash' | null;
          created_at?: string;
        };
      };
      customers: {
        Row: {
          id: number;
          user_id: string;
          full_name: string;
          phone: string | null;
          date_of_birth: string | null;
          gender: string | null;
          status: string;
          referred_by: string | null;
          health_problem: string | null;
          height_cm: number | null;
          weight_kg: number | null;
          bmi: number | null;
          body_fat_pct: number | null;
          visceral_fat: number | null;
          bmr_kcal: number | null;
          body_age: string | null;
          subcutaneous_fat_pct: number | null;
          trunk_subcutaneous_fat_pct: number | null;
          arms_subcutaneous_fat_pct: number | null;
          legs_subcutaneous_fat_pct: number | null;
          is_daily_shake_member: boolean;
          is_distributor: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          full_name: string;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          status?: string;
          referred_by?: string | null;
          health_problem?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          bmi?: number | null;
          body_fat_pct?: number | null;
          visceral_fat?: number | null;
          bmr_kcal?: number | null;
          body_age?: string | null;
          subcutaneous_fat_pct?: number | null;
          trunk_subcutaneous_fat_pct?: number | null;
          arms_subcutaneous_fat_pct?: number | null;
          legs_subcutaneous_fat_pct?: number | null;
          is_daily_shake_member?: boolean;
          is_distributor?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          full_name?: string;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          status?: string;
          referred_by?: string | null;
          health_problem?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          bmi?: number | null;
          body_fat_pct?: number | null;
          visceral_fat?: number | null;
          bmr_kcal?: number | null;
          body_age?: string | null;
          subcutaneous_fat_pct?: number | null;
          trunk_subcutaneous_fat_pct?: number | null;
          arms_subcutaneous_fat_pct?: number | null;
          legs_subcutaneous_fat_pct?: number | null;
          is_daily_shake_member?: boolean;
          is_distributor?: boolean;
          notes?: string | null;
          created_at?: string;
        };
      };
      customer_health_readings: {
        Row: {
          id: number;
          user_id: string;
          customer_id: number;
          reading_date: string;
          height_cm: number | null;
          weight_kg: number | null;
          bmi: number | null;
          body_fat_pct: number | null;
          visceral_fat: number | null;
          bmr_kcal: number | null;
          body_age: string | null;
          subcutaneous_fat_pct: number | null;
          trunk_subcutaneous_fat_pct: number | null;
          arms_subcutaneous_fat_pct: number | null;
          legs_subcutaneous_fat_pct: number | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          customer_id: number;
          reading_date: string;
          height_cm?: number | null;
          weight_kg?: number | null;
          bmi?: number | null;
          body_fat_pct?: number | null;
          visceral_fat?: number | null;
          bmr_kcal?: number | null;
          body_age?: string | null;
          subcutaneous_fat_pct?: number | null;
          trunk_subcutaneous_fat_pct?: number | null;
          arms_subcutaneous_fat_pct?: number | null;
          legs_subcutaneous_fat_pct?: number | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          customer_id?: number;
          reading_date?: string;
          height_cm?: number | null;
          weight_kg?: number | null;
          bmi?: number | null;
          body_fat_pct?: number | null;
          visceral_fat?: number | null;
          bmr_kcal?: number | null;
          body_age?: string | null;
          subcutaneous_fat_pct?: number | null;
          trunk_subcutaneous_fat_pct?: number | null;
          arms_subcutaneous_fat_pct?: number | null;
          legs_subcutaneous_fat_pct?: number | null;
          created_at?: string;
        };
      };
      center_memberships: {
        Row: {
          id: number;
          user_id: string;
          customer_name: string;
          customer_phone: string | null;
          reference: string | null;
          total_shakes: number;
          price: number;
          payment_status: 'pending' | 'paid';
          start_date: string;
          comments: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          customer_name: string;
          customer_phone?: string | null;
          reference?: string | null;
          total_shakes: number;
          price: number;
          payment_status?: 'pending' | 'paid';
          start_date: string;
          comments?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          customer_name?: string;
          customer_phone?: string | null;
          reference?: string | null;
          total_shakes?: number;
          price?: number;
          payment_status?: 'pending' | 'paid';
          start_date?: string;
          comments?: string | null;
          created_at?: string;
        };
      };
      center_membership_visits: {
        Row: {
          id: number;
          membership_id: number;
          user_id: string;
          visit_date: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          membership_id: number;
          user_id: string;
          visit_date: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          membership_id?: number;
          user_id?: string;
          visit_date?: string;
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

export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerHealthReading = Database['public']['Tables']['customer_health_readings']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Inventory = Database['public']['Tables']['inventory']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type CenterMenu = Database['public']['Tables']['center_menu']['Row'];
export type CenterSale = Database['public']['Tables']['center_sales']['Row'];
export type CenterMembership = Database['public']['Tables']['center_memberships']['Row'];
export type CenterMembershipVisit = Database['public']['Tables']['center_membership_visits']['Row'];
