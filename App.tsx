import React, { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

// دالة لتحويل كود الإيموجي في الشات إلى صورة حقيقية
const parseEmotes = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\[emote:\d+:[a-zA-Z0-9_]+\])/g);
  
  return parts.map((part, i) => {
    const emoteMatch = part.match(/\[emote:(\d+):([a-zA-Z0-9_]+)\]/);
    if (emoteMatch) {
      const emoteId = emoteMatch[1];
      const emoteName = emoteMatch[2];
      return (
        <img 
          key={i} 
          src={`https://files.kick.com/emotes/${emoteId}/fullsize`} 
          alt={emoteName}
          title={emoteName}
          className="inline-block h-7 align-middle mx-1"
        />
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export default function App() {
  const [streamerName, setStreamerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamerInfo, setStreamerInfo] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  
  const pusherRef = useRef<Pusher | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const searchStreamer = async () => {
    const name = streamerName.trim().toLowerCase();
    if (!name) return;

    setLoading(true);
    setError('');
    setStreamerInfo(null);
    setChatMessages([]);

    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }

    try {
      const apiUrl = `https://kick.com/api/v2/channels/${name}`;
      
      const proxies = [
        `/api/kick?endpoint=${encodeURIComponent(apiUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`
      ];

      const fetchProxy = async (proxy: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        
        try {
          const response = await fetch(proxy, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error('Bad response');

          const rawData = await response.json();
          let parsedData = rawData;

          if (proxy.includes('allorigins')) {
             if (!rawData.contents) throw new Error('No contents');
             parsedData = JSON.parse(rawData.contents);
          }

          if (parsedData && (parsedData.user || (parsedData.message && parsedData.message.includes('not found')))) {
            return parsedData;
          }
          throw new Error('Invalid data format');
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      let data: any = null;
      try {
        data = await Promise.any(proxies.map(p => fetchProxy(p)));
      } catch (e) {
        throw new Error('فشل في الاتصال بخوادم Kick (نظام حماية Cloudflare). جرب مرة أخرى أو تأكد من Vercel.');
      }

      if (data.message && data.message.includes('not found')) {
        throw new Error('القناة غير موجودة أو الاسم غير صحيح.');
      }

      setStreamerInfo(data);

      if (data.livestream && data.chatroom?.id) {
        connectChat(data.chatroom.id);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء البحث');
    } finally {
      setLoading(false);
    }
  };

  const connectChat = (chatroomId: number) => {
    const pusher = new Pusher('32cbd69e4b950bf97679', {
      cluster: 'us2',
      forceTLS: true,
      enabledTransports: ['ws', 'wss']
    });

    const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

    channel.bind('App\\Events\\ChatMessageEvent', (data: any) => {
      setChatMessages(prev => {
        const newMsgs = [...prev, data];
        return newMsgs.length > 100 ? newMsgs.slice(newMsgs.length - 100) : newMsgs;
      });
    });

    channel.bind('App\\Events\\MessageDeletedEvent', (data: any) => {
      const msgId = data.message?.id;
      if (msgId) {
        setChatMessages(prev => prev.filter(msg => msg.id !== msgId));
      }
    });

    pusherRef.current = pusher;
  };

  useEffect(() => {
    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen text-white font-sans p-5 relative overflow-hidden" dir="rtl" style={{ background: '#050505' }}>
      {/* خلفية داكنة مع شبكة خفيفة */}
      <div 
        className="fixed inset-0 z-0 opacity-10" 
        style={{ 
          backgroundImage: 'linear-gradient(#53fc18 1px, transparent 1px), linear-gradient(90deg, #53fc18 1px, transparent 1px)',
          backgroundSize: '50px 50px' 
        }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#050505]/80 via-[#050505]/95 to-[#050505]"></div>
      
      {/* أضواء خضراء متوهجة متحركة في الخلفية */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#53fc18]/10 rounded-full blur-[150px] animate-pulse pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#00d26a]/10 rounded-full blur-[150px] animate-pulse pointer-events-none z-0" style={{ animationDelay: '2s' }}></div>

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* الهيدر */}
        <div className="text-center mb-10 mt-8">
          <div className="inline-block relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#53fc18] to-[#00d26a] blur-xl opacity-40 group-hover:opacity-80 transition duration-700 rounded-full"></div>
            <div className="relative w-28 h-28 flex items-center justify-center bg-black border-4 border-[#53fc18] rounded-full drop-shadow-[0_0_20px_rgba(83,252,24,0.6)] animate-[bounce_4s_infinite]">
              <span className="text-6xl">🟢</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mt-8 mb-2 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#53fc18] via-[#00d26a] to-[#53fc18] animate-pulse">
            بوابة البث المباشر
          </h1>
          <p className="text-gray-400 font-medium text-lg">تجربة مشاهدة خرافية لأي ستريمر على منصة Kick</p>
        </div>

        {/* صندوق البحث */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
          <div className="relative group w-full sm:w-[400px]">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#53fc18] to-[#00d26a] rounded-xl blur opacity-30 group-hover:opacity-70 transition duration-500"></div>
            <input
              type="text"
              className="relative w-full px-5 py-4 rounded-xl border border-white/10 bg-black/80 backdrop-blur-md text-white focus:outline-none focus:border-[#53fc18] transition-colors text-lg"
              placeholder="أدخل اسم القناة (مثال: xqc)"
              value={streamerName}
              onChange={(e) => setStreamerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchStreamer()}
            />
          </div>
          <button
            onClick={searchStreamer}
            disabled={loading}
            className="relative px-8 py-4 bg-gradient-to-r from-[#53fc18] to-[#00d26a] text-black font-black text-lg rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_25px_rgba(83,252,24,0.5)]"
          >
            {loading ? 'جاري البحث... ⏳' : 'بحث 🚀'}
          </button>
        </div>
        
        {error && (
          <div className="text-center text-[#ff2a2a] bg-black/50 border border-[#ff2a2a]/30 backdrop-blur-md p-4 rounded-xl mb-8 max-w-2xl mx-auto shadow-[0_0_15px_rgba(255,42,42,0.2)]">
            ❌ خطأ: {error}
          </div>
        )}

        {/* معلومات الاستريمر */}
        {streamerInfo && (
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-6 md:p-8 rounded-3xl flex flex-wrap items-center gap-8 mb-10 shadow-[0_8px_32px_rgba(83,252,24,0.05)] transform transition-all duration-700 animate-[fade-in-up_0.5s_ease-out]">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#53fc18] to-[#00d26a] rounded-full blur-lg opacity-60"></div>
              <img 
                src={streamerInfo.user?.profile_pic || 'https://kick.com/favicon.ico'} 
                alt="Avatar" 
                className="relative w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-[#050505] object-cover"
              />
            </div>
            
            <div className="flex-1 min-w-[250px]">
              <h2 className="text-3xl md:text-4xl font-black mb-3 text-white drop-shadow-md">
                {streamerInfo.user?.username}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm font-bold">
                {streamerInfo.livestream ? (
                  <span className="bg-red-600/20 text-red-500 border border-red-500/50 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-[0_0_10px_rgba(255,0,0,0.3)] animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div> يبث الآن
                  </span>
                ) : (
                  <span className="bg-gray-800/50 text-gray-400 border border-gray-600 px-4 py-1.5 rounded-full">
                    ⚫ غير متصل (Offline)
                  </span>
                )}
                <span className="bg-white/5 border border-[#53fc18]/30 px-4 py-1.5 rounded-full text-[#53fc18] shadow-[0_0_10px_rgba(83,252,24,0.1)]">
                  👥 {(streamerInfo.followersCount || streamerInfo.followers_count || 0).toLocaleString()} متابع
                </span>
              </div>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-2xl bg-black/50 p-4 rounded-xl border border-white/5">
                {streamerInfo.user?.bio || 'لا يوجد وصف (بايو)'}
              </p>
              
              {streamerInfo.livestream && (
                <div className="mt-4 inline-block bg-gradient-to-r from-[#53fc18]/10 to-transparent border-r-4 border-[#53fc18] px-4 py-2 rounded-l-lg text-[#53fc18] font-bold text-sm">
                  {streamerInfo.livestream.session_title}
                </div>
              )}
            </div>
          </div>
        )}

        {/* حاوية البث والشات */}
        {streamerInfo?.livestream && (
          <div className="flex flex-col lg:flex-row gap-6 h-[70vh] min-h-[500px] mb-10 animate-[fade-in-up_0.8s_ease-out]">
            
            {/* البث المباشر */}
            <div className="flex-[3] bg-black rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(83,252,24,0.08)] relative group">
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10"></div>
              <iframe
                src={`https://player.kick.com/${streamerInfo.user?.username}?autoplay=true`}
                className="w-full h-full relative z-0"
                allowFullScreen
              ></iframe>
            </div>
            
            {/* الشات الخرافي */}
            <div className="flex-[1] bg-black/70 backdrop-blur-2xl rounded-3xl flex flex-col border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden relative">
              {/* هيدر الشات */}
              <div className="bg-gradient-to-r from-black via-[#0a1a0f] to-black p-4 text-center font-black border-b border-white/10 text-[#53fc18] tracking-widest uppercase relative z-10 shadow-md">
                الشات المباشر 💬
                <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-[#53fc18]/50 to-transparent"></div>
              </div>
              
              {/* الرسائل */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10 scrollbar-hide">
                {chatMessages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[#53fc18]/30 text-sm font-bold animate-pulse">
                    في انتظار الرسائل...
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className="text-[15px] break-words bg-white/5 hover:bg-[#53fc18]/5 p-3 rounded-2xl border border-white/5 transition-colors animate-[slide-in-right_0.3s_ease-out]"
                    >
                      <span 
                        className="font-black drop-shadow-md text-[16px]" 
                        style={{ color: msg.sender?.identity?.color || '#53fc18' }}
                      >
                        {msg.sender?.username}
                      </span>
                      <span className="text-white/30 mx-1">:</span>
                      <span className="text-white/90 leading-relaxed inline-block">
                        {parseEmotes(msg.content)}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {/* زينة أسفل الشات */}
              <div className="h-2 w-full bg-gradient-to-r from-transparent via-[#53fc18]/40 to-transparent"></div>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in-right {
          0% { opacity: 0; transform: translateX(20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        /* Hide scrollbar for a cleaner look */
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}