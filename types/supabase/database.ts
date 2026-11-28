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
      design_budgets: {
        Row: { design_request_id: string; spent_nano: number; stages: Json; status: string; stop_reason: string | null; reservation: Json | null }
        Insert: { design_request_id: string; spent_nano?: number; stages?: Json; status?: string; stop_reason?: string | null; reservation?: Json | null }
        Update: { spent_nano?: number; stages?: Json; status?: string; stop_reason?: string | null; reservation?: Json | null }
        Relationships: [{ foreignKeyName: "design_budgets_design_request_id_fkey"; columns: ["design_request_id"]; isOneToOne: true; referencedRelation: "design_requests"; referencedColumns: ["id"] }]
      }

      design_images: {
        Row: { id: string; design_request_id: string; question_id: string; filename: string; storage_path: string; mime_type: string; created_at: string }
        Insert: { id: string; design_request_id: string; question_id: string; filename: string; storage_path: string; mime_type: string; created_at?: string }
        Update: { filename?: string }
        Relationships: [{ foreignKeyName: "design_images_design_request_id_fkey"; columns: ["design_request_id"]; isOneToOne: false; referencedRelation: "design_requests"; referencedColumns: ["id"] }]
      }
      technical_design_jobs: {
        Row: {
          id: string
          design_request_id: string
          design_analysis_id: string
          repository_sha: string
          prompt_version: string
          model: string
          status: string
          github_run_id: string | null
          github_run_attempt: number | null
          result_email: Json | null
          email_sent_at: string | null
          error: string | null
          created_at: string
          updated_at: string
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          design_request_id: string
          design_analysis_id: string
          repository_sha: string
          prompt_version: string
          model: string
          status?: string
          github_run_id?: string | null
          github_run_attempt?: number | null
          result_email?: Json | null
          email_sent_at?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          design_request_id?: string
          design_analysis_id?: string
          repository_sha?: string
          prompt_version?: string
          model?: string
          status?: string
          github_run_id?: string | null
          github_run_attempt?: number | null
          result_email?: Json | null
          email_sent_at?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Relationships: []
      }
      design_analyses: {
        Row: {
          id: string
          design_request_id: string
          submission_id: string
          base_version: number
          payload_hash: string
          status: string
          version: number | null
          plan: Json | null
          requirements: Json | null
          ambiguities: Json | null
          clarifying_questions: Json | null
          answers: Json | null
          ready: boolean | null
          created_at: string
          started_at: string
          finished_at: string | null
        }
        Insert: {
          id?: string
          design_request_id: string
          submission_id: string
          base_version: number
          payload_hash: string
          status?: string
          version?: number | null
          plan?: Json | null
          requirements?: Json | null
          ambiguities?: Json | null
          clarifying_questions?: Json | null
          answers?: Json | null
          ready?: boolean | null
          created_at?: string
          started_at?: string
          finished_at?: string | null
        }
        Update: {
          id?: string
          design_request_id?: string
          submission_id?: string
          base_version?: number
          payload_hash?: string
          status?: string
          version?: number | null
          plan?: Json | null
          requirements?: Json | null
          ambiguities?: Json | null
          clarifying_questions?: Json | null
          answers?: Json | null
          ready?: boolean | null
          created_at?: string
          started_at?: string
          finished_at?: string | null
        }
        Relationships: []
      }
      design_requests: {
        Row: {
          initial_payload_hash: string | null
          analyze_attempts: number
          change_options: string[]
          analysis_status: string
          id: string
          canva_user_id: string | null
          clarifications: Json
          clarified_at: string | null
          design_image: string
          instructions: string
          requirements: Json
          ambiguities: Json
          clarifying_questions: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          initial_payload_hash?: string | null
          analyze_attempts?: number
          change_options?: string[]
          analysis_status?: string
          id?: string
          canva_user_id?: string | null
          clarifications?: Json
          clarified_at?: string | null
          design_image: string
          instructions: string
          requirements: Json
          ambiguities: Json
          clarifying_questions: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          initial_payload_hash?: string | null
          analyze_attempts?: number
          change_options?: string[]
          analysis_status?: string
          id?: string
          canva_user_id?: string | null
          clarifications?: Json
          clarified_at?: string | null
          design_image?: string
          instructions?: string
          requirements?: Json
          ambiguities?: Json
          clarifying_questions?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      design_budget_action: { Args: { p_id: string; p_owner: string; p_action: string; p_payload?: Json }; Returns: Json }
      reconcile_technical_design_run: { Args: { p_job_id: string; p_run_id: string; p_run_attempt: number }; Returns: undefined }
      reserve_technical_design_job: { Args: { p_request_id: string; p_user_id: string; p_repository_sha: string; p_prompt_version: string; p_model: string }; Returns: Json }
      record_technical_design_job_dispatch: { Args: { p_job_id: string; p_run_id: string | null; p_failed: boolean }; Returns: undefined }
      claim_technical_design_job: { Args: { p_job_id: string; p_run_id: string; p_run_attempt: number }; Returns: Json }
      finish_technical_design_job: { Args: { p_job_id: string; p_run_id: string; p_run_attempt: number }; Returns: boolean }
      fail_technical_design_job: { Args: { p_job_id: string; p_run_id: string; p_run_attempt: number; p_error: string }; Returns: boolean }
      reserve_design_analysis: { Args: { p_request_id: string; p_user_id: string; p_submission_id: string; p_base_version: number; p_payload_hash: string; p_limit: number }; Returns: Json }
      finish_design_analysis: { Args: { p_request_id: string; p_user_id: string; p_submission_id: string; p_analysis: Json; p_answers: Json }; Returns: number }
      fail_design_analysis: { Args: { p_request_id: string; p_user_id: string; p_submission_id: string }; Returns: undefined }
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
