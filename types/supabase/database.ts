export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      artworks: {
        Row: {
          artwork_note: string | null
          collection_id: string
          cover_image: boolean
          created_at: string
          description: string | null
          dimensions: string | null
          id: string
          image_path: string | null
          medium: string | null
          price: number | null
          publish_on: string | null
          sold: boolean
          title: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          artwork_note?: string | null
          collection_id?: string
          cover_image?: boolean
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_path?: string | null
          medium?: string | null
          price?: number | null
          publish_on?: string | null
          sold?: boolean
          title?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          artwork_note?: string | null
          collection_id?: string
          cover_image?: boolean
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_path?: string | null
          medium?: string | null
          price?: number | null
          publish_on?: string | null
          sold?: boolean
          title?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artworks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          collection_name: string
          created_at: string
          desc: string | null
          id: string
        }
        Insert: {
          collection_name: string
          created_at?: string
          desc?: string | null
          id?: string
        }
        Update: {
          collection_name?: string
          created_at?: string
          desc?: string | null
          id?: string
        }
        Relationships: []
      }
      cover_images: {
        Row: {
          created_at: string
          id: number
          image_path: string
        }
        Insert: {
          created_at?: string
          id?: number
          image_path: string
        }
        Update: {
          created_at?: string
          id?: number
          image_path?: string
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          artwork_id: string
          created_at: string
          id: string
          image_path: string | null
          order: number
        }
        Insert: {
          artwork_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          order: number
        }
        Update: {
          artwork_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_images_artwork_id_fkey"
            columns: ["artwork_id"]
            isOneToOne: false
            referencedRelation: "artworks"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          amount: number | null
          artwork_id: string | null
          buyer_email: string
          buyer_name: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          postal_code: string | null
          shipping_cost: number
          state: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          amount?: number | null
          artwork_id?: string | null
          buyer_email: string
          buyer_name: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          postal_code?: string | null
          shipping_cost: number
          state?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          amount?: number | null
          artwork_id?: string | null
          buyer_email?: string
          buyer_name?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          postal_code?: string | null
          shipping_cost?: number
          state?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_event: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          id: string
          processed_at: string
          status_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          id?: string
          processed_at?: string
          status_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          id?: string
          processed_at?: string
          status_type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
