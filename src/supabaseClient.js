import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ewkbxrwhntuygqszuwgv.supabase.co'
const supabaseKey = 'sb_publishable_yWDoVs64qhS7HzzuK-R8Ag_MOPfb_4c'

export const supabase = createClient(supabaseUrl, supabaseKey)
