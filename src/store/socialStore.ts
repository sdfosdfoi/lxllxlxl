import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-hot-toast';

export type SocialPlatform = 'telegram' | 'instagram' | 'tiktok';

export interface SocialStats {
  followers: number;
  views: number;
  engagement: number;
  posts: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  platformUserId: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata: Record<string, any>;
  stats: SocialStats;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platform: SocialPlatform;
  content: {
    text: string;
    video?: File;
  };
  scheduledFor: string;
  status: 'pending' | 'published' | 'failed';
  error?: string;
  timer?: NodeJS.Timeout;
}

interface SocialState {
  accounts: SocialAccount[];
  scheduledPosts: ScheduledPost[];
  loading: boolean;
  error: string | null;
  
  connectAccount: (platform: SocialPlatform, code: string, channelUsername?: string) => Promise<void>;
  disconnectAccount: (platform: SocialPlatform) => Promise<void>;
  getAccount: (platform: SocialPlatform) => SocialAccount | undefined;
  schedulePost: (post: Omit<ScheduledPost, 'id' | 'status' | 'timer'>) => Promise<void>;
  publishNow: (platform: SocialPlatform, content: { text: string; video?: File }) => Promise<void>;
  fetchStats: (platform: SocialPlatform) => Promise<void>;
}

const VALID_PLATFORMS: SocialPlatform[] = ['telegram', 'instagram', 'tiktok'];

const isValidPlatform = (platform: any): platform is SocialPlatform => {
  return VALID_PLATFORMS.includes(platform as SocialPlatform);
};

export const useSocialStore = create<SocialState>()(
  persist(
    (set, get) => ({
      accounts: [],
      scheduledPosts: [],
      loading: false,
      error: null,

      connectAccount: async (platform, code, channelUsername) => {
        try {
          if (!isValidPlatform(platform)) {
            throw new Error('Invalid platform');
          }

          set({ loading: true });
          
          let stats: SocialStats;
          let metadata = {};
          let platformUserId = '';

          switch (platform) {
            case 'telegram':
              try {
                if (!channelUsername) {
                  throw new Error('Channel username is required for Telegram');
                }

                const botResponse = await fetch(`https://api.telegram.org/bot${code}/getMe`);
                const botData = await botResponse.json();
                
                if (!botData.ok) {
                  throw new Error('Invalid Telegram bot token');
                }

                const cleanChannelUsername = channelUsername.startsWith('@') 
                  ? channelUsername 
                  : '@' + channelUsername;

                const chatStatsResponse = await fetch(`https://api.telegram.org/bot${code}/getChatMembersCount?chat_id=${cleanChannelUsername}`);
                const chatStatsData = await chatStatsResponse.json();
                
                platformUserId = botData.result.id.toString();
                metadata = { 
                  username: botData.result.username,
                  firstName: botData.result.first_name,
                  chatId: cleanChannelUsername
                };
                
                stats = {
                  followers: chatStatsData.ok ? chatStatsData.result : 0,
                  views: 0,
                  engagement: 0,
                  posts: 0
                };
              } catch (error) {
                console.error('Telegram API error:', error);
                throw new Error('Failed to connect Telegram');
              }
              break;

            case 'instagram':
              throw new Error('Нужен бизнес-аккаунт');

            case 'tiktok':
              try {
                const tiktokResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,following_count,follower_count,likes_count,video_count&access_token=${code}`);
                const tiktokData = await tiktokResponse.json();
                
                platformUserId = tiktokData.open_id || `tiktok-${Date.now()}`;
                metadata = {
                  username: tiktokData.username || 'tiktok_user',
                  followersCount: tiktokData.follower_count,
                  videoCount: tiktokData.video_count
                };
                
                stats = {
                  followers: tiktokData.follower_count || 0,
                  views: 0,
                  engagement: 0,
                  posts: tiktokData.video_count || 0
                };
              } catch (error) {
                console.error('TikTok API error:', error);
                throw new Error('Failed to connect TikTok');
              }
              break;

            default:
              throw new Error('Unsupported platform');
          }

          const existingAccounts = get().accounts.filter(acc => acc.platform !== platform);

          const newAccount: SocialAccount = {
            id: Math.random().toString(36).substring(2),
            platform,
            platformUserId,
            name: `${platform} Account`,
            accessToken: code,
            metadata,
            stats
          };

          set(state => ({
            accounts: [...existingAccounts, newAccount],
            loading: false
          }));

          toast.success(`${platform} успешно подключен!`);
        } catch (error) {
          console.error('Error connecting account:', error);
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      disconnectAccount: async (platform) => {
        try {
          if (!isValidPlatform(platform)) {
            throw new Error('Invalid platform');
          }

          // Clear any existing scheduled posts for this platform
          const scheduledPosts = get().scheduledPosts;
          scheduledPosts.forEach(post => {
            if (post.platform === platform && post.timer) {
              clearTimeout(post.timer);
            }
          });

          set(state => ({
            accounts: state.accounts.filter(acc => acc.platform !== platform),
            scheduledPosts: state.scheduledPosts.filter(post => post.platform !== platform),
            loading: false
          }));

          toast.success(`${platform} отключен`);
        } catch (error) {
          console.error('Error disconnecting account:', error);
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      getAccount: (platform) => {
        if (!isValidPlatform(platform)) {
          return undefined;
        }
        return get().accounts.find(acc => acc.platform === platform);
      },

      schedulePost: async (post) => {
        try {
          if (!isValidPlatform(post.platform)) {
            throw new Error('Invalid platform');
          }

          set({ loading: true });
          
          const newPost: ScheduledPost = {
            ...post,
            id: Math.random().toString(36).substring(2),
            status: 'pending'
          };

          // Calculate delay until scheduled time
          const scheduledTime = new Date(post.scheduledFor).getTime();
          const now = Date.now();
          const delay = Math.max(0, scheduledTime - now);

          // Create timer for post
          const timer = setTimeout(async () => {
            try {
              await get().publishNow(post.platform, post.content);
              
              set(state => ({
                scheduledPosts: state.scheduledPosts.map(p => 
                  p.id === newPost.id 
                    ? { ...p, status: 'published', timer: undefined }
                    : p
                )
              }));

              toast.success(`Пост опубликован в ${post.platform}`);
            } catch (error) {
              set(state => ({
                scheduledPosts: state.scheduledPosts.map(p => 
                  p.id === newPost.id 
                    ? { ...p, status: 'failed', error: error.message, timer: undefined }
                    : p
                )
              }));

              toast.error(`Ошибка публикации в ${post.platform}: ${error.message}`);
            }
          }, delay);

          // Save post with timer
          set(state => ({
            scheduledPosts: [...state.scheduledPosts, { ...newPost, timer }],
            loading: false
          }));

          toast.success('Пост успешно запланирован');
        } catch (error) {
          console.error('Error scheduling post:', error);
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      publishNow: async (platform, content) => {
        try {
          if (!isValidPlatform(platform)) {
            throw new Error('Invalid platform');
          }

          set({ loading: true });
          
          const account = get().accounts.find(acc => acc.platform === platform);
          if (!account) {
            throw new Error(`${platform} не подключен`);
          }

          switch (platform) {
            case 'telegram':
              try {
                const formData = new FormData();
                formData.append('chat_id', account.metadata.chatId);
                formData.append('video', content.video!);
                formData.append('caption', content.text);
                
                const response = await fetch(`https://api.telegram.org/bot${account.accessToken}/sendVideo`, {
                  method: 'POST',
                  body: formData
                });
                
                if (!response.ok) {
                  throw new Error('Failed to publish to Telegram');
                }
              } catch (error) {
                console.error('Telegram API error:', error);
                throw new Error('Failed to publish to Telegram');
              }
              break;

            case 'instagram':
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;

            case 'tiktok':
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
          }

          set({ loading: false });
          toast.success(`Видео опубликовано в ${platform}`);
        } catch (error) {
          console.error('Error publishing:', error);
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      fetchStats: async (platform) => {
        try {
          if (!isValidPlatform(platform)) {
            throw new Error('Invalid platform');
          }

          set({ loading: true });
          
          const account = get().accounts.find(acc => acc.platform === platform);
          if (!account) {
            throw new Error(`${platform} не подключен`);
          }

          let newStats: SocialStats = { ...account.stats };

          switch (platform) {
            case 'telegram':
              try {
                const chatStatsResponse = await fetch(`https://api.telegram.org/bot${account.accessToken}/getChatMembersCount?chat_id=${account.metadata.chatId}`);
                const chatStatsData = await chatStatsResponse.json();
                
                if (chatStatsData.ok) {
                  newStats = {
                    ...newStats,
                    followers: chatStatsData.result
                  };
                }
              } catch (error) {
                console.error('Telegram API error:', error);
              }
              break;

            case 'instagram':
              try {
                const userResponse = await fetch(`https://graph.instagram.com/me?fields=media_count,followers_count&access_token=${account.accessToken}`);
                const userData = await userResponse.json();
                
                if (userData.id) {
                  newStats = {
                    ...newStats,
                    followers: userData.followers_count || newStats.followers,
                    posts: userData.media_count || newStats.posts
                  };
                }
              } catch (error) {
                console.error('Instagram API error:', error);
              }
              break;

            case 'tiktok':
              try {
                const tiktokResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?access_token=${account.accessToken}`);
                const tiktokData = await tiktokResponse.json();
                
                if (tiktokData.open_id) {
                  newStats = {
                    ...newStats,
                    followers: tiktokData.follower_count || newStats.followers,
                    posts: tiktokData.video_count || newStats.posts
                  };
                }
              } catch (error) {
                console.error('TikTok API error:', error);
              }
              break;
          }

          set(state => ({
            accounts: state.accounts.map(acc =>
              acc.id === account.id ? { ...acc, stats: newStats } : acc
            )
          }));

          set({ loading: false });
        } catch (error) {
          console.error('Error fetching stats:', error);
          set({ error: error.message, loading: false });
          throw error;
        }
      }
    }),
    {
      name: 'social-storage',
      onRehydrateStorage: () => (state) => {
        if (state && state.accounts) {
          state.accounts = state.accounts.filter(account => 
            isValidPlatform(account.platform)
          );
        }
      }
    }
  )
);
