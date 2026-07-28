function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }

  return value;
}

export const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
