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
        // The `authenticated` role's grant is column-restricted (Phase 16
        // migration) to display_name, avatar_initials, last_team_id — id and
        // created_at appear here for shape-completeness with what a real
        // generated file would show, but an ordinary client's own .update()
        // can't actually touch them.
        Row: {
          id: string;
          display_name: string | null;
          avatar_initials: string;
          last_team_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_initials: string;
          last_team_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_initials?: string;
          last_team_id?: string | null;
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
          {
            foreignKeyName: "profiles_last_team_id_fkey";
            columns: ["last_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
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
      team_invites: {
        // token_hash is part of the row's shape but is NOT selectable by the
        // anon/authenticated roles — the Phase 14 migration revokes it at the
        // column level. Only the service-role client and the SECURITY DEFINER
        // invite functions can read it; never add it to a .select() list.
        Row: {
          id: string;
          team_id: string;
          email: string;
          role: Database["public"]["Enums"]["team_role"];
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          email: string;
          role?: Database["public"]["Enums"]["team_role"];
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["team_role"];
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_invites_accepted_by_fkey";
            columns: ["accepted_by"];
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
    // Only the functions the app actually calls are listed. The SECURITY
    // DEFINER helpers that exist purely to be called from inside RLS policies
    // (is_team_member, project_team_id, environment_team_id,
    // can_bootstrap_team_admin, shares_team_with) are deliberately absent —
    // nothing should be reaching them over PostgREST.
    Functions: {
      create_team: {
        Args: { p_name: string; p_slug: string };
        Returns: Database["public"]["Tables"]["teams"]["Row"];
      };
      // Inserts the project plus its three default environments in one
      // transaction — see the Phase 18 migration for why RETURNING is safe
      // here even though create_team() above avoids it for teams.
      create_project: {
        Args: { p_team_id: string; p_name: string; p_description?: string | null };
        Returns: Database["public"]["Tables"]["projects"]["Row"];
      };
      team_has_member_with_email: {
        Args: { p_team_id: string; p_email: string };
        Returns: boolean;
      };
      // `returns table (...)` is a set, so this one really does come back as an
      // array — unlike the composite-returning functions below it.
      get_team_members: {
        Args: { p_team_id: string };
        Returns: {
          member_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["team_role"];
          joined_at: string;
          display_name: string | null;
          avatar_initials: string | null;
          email: string | null;
        }[];
      };
      get_invite_preview: {
        Args: { p_token_hash: string };
        Returns: Database["public"]["CompositeTypes"]["invite_preview"];
      };
      accept_team_invite: {
        Args: { p_token_hash: string };
        Returns: Database["public"]["CompositeTypes"]["accept_invite_result"];
      };
      // Resolves actor email/display_name for arbitrary audit_logs.user_id
      // values, including former team members — see the Phase 30 migration.
      get_audit_log_actors: {
        Args: { p_team_id: string; p_user_ids: string[] };
        Returns: {
          user_id: string;
          email: string | null;
          display_name: string | null;
        }[];
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
    // Both status fields are `text` in Postgres, so a generated file would
    // type them as plain `string`. They're narrowed to the exact set the
    // functions can return so the callers' switch statements are checked for
    // exhaustiveness — if a new status is added to the SQL, adding it here is
    // what makes TypeScript point at every place that has to handle it.
    CompositeTypes: {
      invite_preview: {
        status: "valid" | "invalid" | "expired" | "revoked" | "used";
        team_name: string | null;
        email: string | null;
        role: Database["public"]["Enums"]["team_role"] | null;
        expires_at: string | null;
      };
      accept_invite_result: {
        status:
          | "accepted"
          | "already_member"
          | "not_authenticated"
          | "invalid"
          | "expired"
          | "revoked"
          | "used"
          | "email_mismatch";
        team_slug: string | null;
        team_name: string | null;
      };
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"],
> = PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions];
