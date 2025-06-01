import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

// Настройки Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Заголовки для CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { postId } = await req.json();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    // Проверка JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid or expired token');
    }

    console.log('✅ Authenticated user:', user.id);
    console.log('🔍 Fetching post with ID:', postId);

    // Получаем пост и привязанный аккаунт
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .select(`
        *,
        social_accounts!inner(*)
      `)
      .eq('id', postId)
      .eq('social_accounts.user_id', user.id) // Проверяем принадлежность
      .single();

    if (postError || !post) {
      console.error('⚠️ Post not found or access denied:', postError?.message);
      throw new Error('Post not found or unauthorized access');
    }

    console.log('📦 Found post:', post);

    // Публикация на платформу
    let result;
    switch (post.platform) {
      case 'telegram':
        result = await publishToTelegram(post);
        break;
      case 'instagram':
        result = await publishToInstagram(post);
        break;
      case 'tiktok':
        result = await publishToTiktok(post);
        break;
      default:
        throw new Error(`Unsupported platform: ${post.platform}`);
    }

    // Обновляем статус публикации
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', postId);

    if (updateError) {
      console.error('❌ Failed to update post status:', updateError.message);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('❌ Error occurred:', error.message);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});

// Заглушки публикации
async function publishToTelegram(post: any) {
  console.log('📤 Publishing to Telegram...');
  // TODO: интеграция с Telegram Bot API
  return { platform: 'telegram', status: 'ok (mock)' };
}

async function publishToInstagram(post: any) {
  console.log('📤 Publishing to Instagram...');
  // TODO: интеграция с Instagram Graph API
  return { platform: 'instagram', status: 'ok (mock)' };
}

async function publishToTiktok(post: any) {
  console.log('📤 Publishing to TikTok...');
  // TODO: интеграция с TikTok API
  return { platform: 'tiktok', status: 'ok (mock)' };
}
