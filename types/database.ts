// Hand-written to match the shape `supabase gen types typescript` produces.
// The project isn't linked to the Supabase CLI (no `supabase login`/`link`
// set up — migrations are run by hand via the Studio SQL editor), so this
// is maintained manually. Keep it in sync with supabase/migrations/*.sql;
// if the CLI ever gets linked, regenerating should slot in without any
// consuming code needing to change shape.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_initials: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_initials: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_initials?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["team_role"];
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["team_role"];
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["team_role"];
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          name?: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      environments: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "environments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      variables: {
        Row: {
          id: string;
          environment_id: string;
          key: string;
          encrypted_value: string;
          encrypted_dek: string;
          iv: string;
          auth_tag: string;
          description: string | null;
          created_by: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          environment_id: string;
          key: string;
          encrypted_value: string;
          encrypted_dek: string;
          iv: string;
          auth_tag: string;
          description?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          environment_id?: string;
          key?: string;
          encrypted_value?: string;
          encrypted_dek?: string;
          iv?: string;
          auth_tag?: string;
          description?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "variables_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "variables_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "variables_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          team_id: string;
          user_id: string | null;
          action: Database["public"]["Enums"]["audit_action"];
          target_type: string;
          target_id: string;
          environment_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id?: string | null;
          action: Database["public"]["Enums"]["audit_action"];
          target_type: string;
          target_id: string;
          environment_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          user_id?: string | null;
          action?: Database["public"]["Enums"]["audit_action"];
          target_type?: string;
          target_id?: string;
          environment_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
        ];
      };
      security_scans: {
        Row: {
          id: string;
          project_id: string;
          environment_id: string;
          score: number;
          issues: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          environment_id: string;
          score: number;
          issues?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          environment_id?: string;
          score?: number;
          issues?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "security_scans_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "security_scans_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_team: {
        Args: { p_name: string; p_slug: string };
        Returns: Database["public"]["Tables"]["teams"]["Row"];
      };
    };
    Enums: {
      team_role: "admin" | "member" | "readonly";
      audit_action:
        | "create"
        | "read"
        | "update"
        | "delete"
        | "permission_change"
        | "invite";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableNameOrOptions]["Row"];

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableNameOrOptions]["Insert"];

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableNameOrOptions]["Update"];

export type Enums<PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][PublicEnumNameOrOptions];
