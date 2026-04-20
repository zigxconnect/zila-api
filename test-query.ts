import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    const { data, error } = await supabase
        .from('internship_applications')
        .select(`
            id,
            status,
            created_at,
            internships (
                title,
                description,
                location,
                is_paid,
                company_profiles (
                    company_name,
                    industry
                )
            ),
            supervisor_profiles (
                full_name,
                email,
                department
            )
        `)
        .limit(1);
    
    if (error) {
        console.error('ERROR:', JSON.stringify(error, null, 2));
    } else {
        console.log('SUCCESS:', JSON.stringify(data, null, 2));
    }
}
testQuery();
