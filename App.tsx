import React, { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

// ===== نظام استخراج الألوان من الصور =====
const extractColorsFromImage = (imgUrl: string): Promise<[string, string]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(['#53fc18', '#00d26a']); return; }
        
        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        const imageData = ctx.getImageData(0, 0, 50, 50).data;
        
        // تجميع الألوان مع تجاهل الألوان القريبة من الأسود والأبيض والرمادي
        const colorBuckets: Record<string, { r: number, g: number, b: number, count: number }> = {};
        
        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          
          // تجاهل الألوان الداكنة جداً أو الفاتحة جداً أو الرمادية
          const brightness = (r + g + b) / 3;
          if (brightness < 30 || brightness > 230) continue;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          if (maxC - minC < 25) continue; // تجاهل الرمادي
          
          // تقريب الألوان لتجميعها في مجموعات
          const key = `${Math.round(r / 20) * 20}-${Math.round(g / 20) * 20}-${Math.round(b / 20) * 20}`;
          if (!colorBuckets[key]) {
            colorBuckets[key] = { r: 0, g: 0, b: 0, count: 0 };
          }
          colorBuckets[key].r += r;
          colorBuckets[key].g += g;
          colorBuckets[key].b += b;
          colorBuckets[key].count++;
        }
        
        // ترتيب حسب الأكثر تكراراً
        const sorted = Object.values(colorBuckets)
          .filter(c => c.count > 3)
          .sort((a, b) => b.count - a.count);
        
        if (sorted.length === 0) { resolve(['#53fc18', '#00d26a']); return; }
        
        const primary = sorted[0];
        const pR = Math.round(primary.r / primary.count);
        const pG = Math.round(primary.g / primary.count);
        const pB = Math.round(primary.b / primary.count);
        const primaryHex = rgbToHex(pR, pG, pB);
        
        // اللون الثاني: أبعد لون عن اللون الأول
        let secondaryHex = lightenColor(primaryHex, 30);
        if (sorted.length > 1) {
          let maxDist = 0;
          let bestIdx = 1;
          for (let j = 1; j < Math.min(sorted.length, 10); j++) {
            const s = sorted[j];
            const sR = Math.round(s.r / s.count);
            const sG = Math.round(s.g / s.count);
            const sB = Math.round(s.b / s.count);
            const dist = Math.sqrt((pR - sR) ** 2 + (pG - sG) ** 2 + (pB - sB) ** 2);
            if (dist > maxDist) { maxDist = dist; bestIdx = j; }
          }
          const sec = sorted[bestIdx];
          secondaryHex = rgbToHex(
            Math.round(sec.r / sec.count),
            Math.round(sec.g / sec.count),
            Math.round(sec.b / sec.count)
          );
        }
        
        resolve([saturateColor(primaryHex), saturateColor(secondaryHex)]);
      } catch (e) {
        resolve(['#53fc18', '#00d26a']);
      }
    };
    img.onerror = () => resolve(['#53fc18', '#00d26a']);
    img.src = imgUrl;
  });
};

const rgbToHex = (r: number, g: number, b: number) => 
  '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

const lightenColor = (hex: string, amount: number): string => {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return rgbToHex(r, g, b);
};

const saturateColor = (hex: string): string => {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  if (max === 0) return hex;
  const factor = Math.min(255 / max, 1.4);
  r = Math.min(255, Math.round(r * factor));
  g = Math.min(255, Math.round(g * factor));
  b = Math.min(255, Math.round(b * factor));
  return rgbToHex(r, g, b);
};

const hexToRgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16)
});

// ===== دالة لتحويل كود الإيموجي في الشات إلى صورة حقيقية =====
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

// ===== الألوان الافتراضية =====
const DEFAULT_C1 = '#09d598';
const DEFAULT_C2 = '#06a575';

export default function App() {
  const [streamerName, setStreamerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamerInfo, setStreamerInfo] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [c1, setC1] = useState(DEFAULT_C1); // اللون الرئيسي
  const [c2, setC2] = useState(DEFAULT_C2); // اللون الثانوي
  const [dataSaverMode, setDataSaverMode] = useState(false); // وضع توفير البيانات
  
  const pusherRef = useRef<Pusher | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // إدارة اتصال الشات بناءً على وضع التوفير
  useEffect(() => {
    if (streamerInfo?.livestream && streamerInfo.chatroom?.id) {
      if (dataSaverMode) {
        if (pusherRef.current) {
          pusherRef.current.disconnect();
          pusherRef.current = null;
        }
      } else {
        if (!pusherRef.current) {
          connectChat(streamerInfo.chatroom.id);
        }
      }
    }
  }, [dataSaverMode, streamerInfo]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // إذا كان المستخدم قريب من الأسفل، انزل للأسفل تلقائياً
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      
      if (isNearBottom || chatMessages.length < 10) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // استخراج الألوان عند تحميل بيانات الاستريمر
  useEffect(() => {
    if (!streamerInfo) {
      setC1(DEFAULT_C1);
      setC2(DEFAULT_C2);
      return;
    }
    
    const avatarUrl = streamerInfo.user?.profile_pic;
    const bannerUrl = streamerInfo.banner_image?.url || streamerInfo.banner?.url || streamerInfo.banner_image;
    
    const extractAll = async () => {
      const results: [string, string][] = [];
      
      // حاول من البانر أولاً (لأنه أوضح)
      if (bannerUrl && typeof bannerUrl === 'string') {
        try {
          const bannerColors = await extractColorsFromImage(bannerUrl);
          results.push(bannerColors);
        } catch (e) {}
      }
      
      // ثم من صورة البروفايل
      if (avatarUrl) {
        try {
          const avatarColors = await extractColorsFromImage(avatarUrl);
          results.push(avatarColors);
        } catch (e) {}
      }
      
      if (results.length > 0) {
        // لو عندنا ألوان من البانر والأفاتار، خذ الأول من البانر والثاني من الأفاتار
        if (results.length >= 2) {
          setC1(results[0][0]); // اللون الرئيسي من البانر
          setC2(results[1][0]); // اللون الثانوي من الأفاتار
        } else {
          setC1(results[0][0]);
          setC2(results[0][1]);
        }
      }
    };
    
    extractAll();
  }, [streamerInfo]);

  // تشغيل البحث إذا كان هناك اسم قناة في الرابط عند تحميل الموقع
  useEffect(() => {
    const pathName = window.location.pathname.replace('/', '').trim();
    if (pathName) {
      setStreamerName(pathName);
      searchStreamer(pathName);
    }
  }, []);

  const searchStreamer = async (nameToSearch?: string) => {
    const name = (typeof nameToSearch === 'string' ? nameToSearch : streamerName).trim().toLowerCase();
    if (!name) return;

    // تحديث الرابط في المتصفح لسهولة المشاركة
    window.history.pushState(null, '', `/${name}`);

    setLoading(true);
    setError('');
    setStreamerInfo(null);
    setChatMessages([]);
    setC1(DEFAULT_C1);
    setC2(DEFAULT_C2);

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

  // حساب الـ RGB لاستخدامه في الشفافيات
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);

  return (
    <div className="min-h-screen text-white font-sans p-5 relative overflow-hidden" dir="rtl" style={{ background: '#050505', transition: 'all 1s ease' }}>
      {/* خلفية شبكة ديناميكية */}
      <div 
        className="fixed inset-0 z-0 opacity-10 transition-all duration-1000" 
        style={{ 
          backgroundImage: `linear-gradient(${c1} 1px, transparent 1px), linear-gradient(90deg, ${c1} 1px, transparent 1px)`,
          backgroundSize: '50px 50px' 
        }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#050505]/80 via-[#050505]/95 to-[#050505]"></div>
      
      {/* أضواء متوهجة ديناميكية - تختفي في وضع التوفير */}
      {!dataSaverMode && (
        <>
          <div 
            className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] animate-pulse pointer-events-none z-0 transition-all duration-1000" 
            style={{ backgroundColor: `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.12)` }}
          />
          <div 
            className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] animate-pulse pointer-events-none z-0 transition-all duration-1000" 
            style={{ backgroundColor: `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.12)`, animationDelay: '2s' }}
          />
        </>
      )}

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* الهيدر */}
        <div className="text-center mb-10 mt-8">
          <div className="inline-block relative group">
            <div 
              className="absolute inset-0 blur-xl opacity-40 group-hover:opacity-80 transition duration-700 rounded-full"
              style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }}
            />
            <div 
              className="relative w-32 h-32 flex items-center justify-center bg-black/60 backdrop-blur-md border-4 rounded-full animate-[bounce_4s_infinite] transition-all duration-1000 overflow-hidden"
              style={{ 
                borderColor: c1, 
                boxShadow: `0 0 25px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.6)` 
              }}
            >
              <img src="/2.png" alt="Logo" className="w-full h-full object-contain p-2 drop-shadow-lg" />
            </div>
          </div>
          <h1 
            className="text-4xl md:text-5xl font-black mt-8 mb-2 tracking-tight bg-clip-text text-transparent animate-pulse transition-all duration-1000"
            style={{ backgroundImage: `linear-gradient(to right, ${c1}, ${c2}, ${c1})` }}
          >
            بوابة البث المباشر
          </h1>
          <p className="text-gray-400 font-medium text-lg">تجربة مشاهدة خرافية لأي ستريمر على منصة Kick</p>
        </div>

        {/* صندوق البحث */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
          <div className="relative group w-full sm:w-[400px]">
            <div 
              className="absolute -inset-0.5 rounded-xl blur opacity-30 group-hover:opacity-70 transition duration-500"
              style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }}
            />
            <input
              type="text"
              className="relative w-full px-5 py-4 rounded-xl border border-white/10 bg-black/80 backdrop-blur-md text-white focus:outline-none transition-colors text-lg"
              style={{ ['--tw-ring-color' as any]: c1 }}
              placeholder="أدخل اسم القناة (مثال: xqc)"
              value={streamerName}
              onChange={(e) => setStreamerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchStreamer()}
            />
          </div>
          <button
            onClick={searchStreamer}
            disabled={loading}
            className="relative px-8 py-4 text-black font-black text-lg rounded-xl hover:scale-105 transition-all duration-500 disabled:opacity-50 disabled:hover:scale-100"
            style={{ 
              background: `linear-gradient(to right, ${c1}, ${c2})`,
              boxShadow: `0 0 25px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.5)` 
            }}
          >
            {loading ? 'جاري البحث... ⏳' : 'بحث 🚀'}
          </button>
        </div>

        {/* زر وضع توفير البيانات */}
        <div className="flex justify-center mb-10 animate-[fade-in-up_0.5s_ease-out]">
          <button 
            onClick={() => setDataSaverMode(!dataSaverMode)}
            className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all duration-500 border backdrop-blur-md ${dataSaverMode ? 'bg-red-500/10 text-red-400 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
          >
            <span className="text-2xl">{dataSaverMode ? '🛑' : '🔋'}</span>
            <span className="tracking-wide">
              {dataSaverMode ? 'وضع التوفير مُفعّل (يتم إيقاف الشات والخلفيات)' : 'تفعيل وضع توفير البيانات'}
            </span>
          </button>
        </div>
        
        {error && (
          <div className="text-center text-[#ff2a2a] bg-black/50 border border-[#ff2a2a]/30 backdrop-blur-md p-4 rounded-xl mb-8 max-w-2xl mx-auto shadow-[0_0_15px_rgba(255,42,42,0.2)]">
            ❌ خطأ: {error}
          </div>
        )}

        {/* 8 مميزات في الصفحة الرئيسية - تختفي عند عرض بيانات الستريمر */}
        {!streamerInfo && !loading && !error && (
          <div className="mb-16 animate-[fade-in-up_0.6s_ease-out]">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-black text-white/90 mb-2">لماذا تستخدم بوابتنا؟</h2>
              <div className="h-1 w-20 mx-auto rounded-full transition-all duration-1000" style={{ background: `linear-gradient(to right, ${c1}, ${c2})` }}></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {[
                { icon: '🔴', title: 'بث مباشر', desc: 'شاهد أي ستريمر مباشرةً بجودة عالية بدون تأخير' },
                { icon: '💬', title: 'شات حي', desc: 'شاهد رسائل الشات مباشرة مع دعم الإيموجيات والستيكرات' },
                { icon: '🎨', title: 'ألوان ذكية', desc: 'الموقع يتلون تلقائياً بألوان صورة وبانر الستريمر' },
                { icon: '⚡', title: 'سرعة خارقة', desc: 'نظام بروكسي متوازي يجلب البيانات بلمح البصر' },
                { icon: '👤', title: 'معلومات كاملة', desc: 'عدد المتابعين، البايو، حالة البث، وعنوان الستريم' },
                { icon: '📱', title: 'تصميم متجاوب', desc: 'يعمل بشكل مثالي على الكمبيوتر والجوال والتابلت' },
                { icon: '🔒', title: 'بدون تسجيل', desc: 'لا حاجة لحساب أو تسجيل دخول. ابحث وشاهد فوراً' },
                { icon: '🔋', title: 'وضع التوفير', desc: 'نظام ذكي يقلل استهلاك الإنترنت بإيقاف الشات والخلفيات' },
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="group relative bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:-translate-y-2 transition-all duration-500 cursor-default overflow-hidden"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {/* توهج خلفي عند Hover */}
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                    style={{ background: `radial-gradient(circle at center, rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.08), transparent 70%)` }}
                  />
                  {/* خط لامع يتحرك */}
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"></div>
                  
                  <div className="relative z-10">
                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">{feature.icon}</div>
                    {/* تم إصلاح مشكلة لون الخلفية المزعج في العناوين */}
                    <h3 className="font-black text-white text-base mb-1 transition-colors duration-500 group-hover:text-[#09d598]">
                      {feature.title}
                    </h3>
                    <p className="text-white/40 text-xs leading-relaxed group-hover:text-white/60 transition-colors duration-500">{feature.desc}</p>
                  </div>

                  {/* حدود متوهجة عند hover */}
                  <div 
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ boxShadow: `inset 0 0 0 1px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.3), 0 0 15px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.1)` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* معلومات الاستريمر */}
        {streamerInfo && (
          <div 
            className="relative bg-[#0a0a0a] border border-white/10 p-6 md:p-8 rounded-3xl flex flex-wrap items-center gap-8 mb-10 transform transition-all duration-700 animate-[fade-in-up_0.5s_ease-out] overflow-hidden"
            style={{ 
              boxShadow: `0 8px 32px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.15)`
            }}
          >
            {/* صورة البانر في الخلفية */}
            {(streamerInfo.banner_image?.url || streamerInfo.banner?.url || (typeof streamerInfo.banner_image === 'string' ? streamerInfo.banner_image : null)) ? (
              <div 
                className="absolute inset-0 z-0 opacity-40 transition-all duration-1000"
                style={{
                  backgroundImage: `url(${streamerInfo.banner_image?.url || streamerInfo.banner?.url || streamerInfo.banner_image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <div 
                className="absolute inset-0 z-0 opacity-10 transition-all duration-1000"
                style={{
                  background: `linear-gradient(45deg, ${c1}, ${c2})`,
                }}
              />
            )}
            
            {/* طبقة تظليل لضمان وضوح النص مع إبقاء البانر مرئي */}
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-black/90 via-black/40 to-black/90"></div>
            <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/80 via-transparent to-black/40"></div>

            <div className="relative z-10">
              <div 
                className="absolute inset-0 rounded-full blur-lg opacity-60 transition-all duration-1000"
                style={{ background: `linear-gradient(to top right, ${c1}, ${c2})` }}
              />
              <img 
                src={streamerInfo.user?.profile_pic || 'https://kick.com/favicon.ico'} 
                alt="Avatar" 
                className="relative w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-[#050505] object-cover"
              />
            </div>
            
            <div className="flex-1 min-w-[250px] relative z-10">
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
                <span 
                  className="bg-white/5 px-4 py-1.5 rounded-full transition-all duration-1000"
                  style={{ 
                    borderWidth: '1px', borderStyle: 'solid',
                    borderColor: `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.3)`,
                    color: c1,
                    boxShadow: `0 0 10px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.1)` 
                  }}
                >
                  👥 {(streamerInfo.followersCount || streamerInfo.followers_count || 0).toLocaleString()} متابع
                </span>
                
                {/* زر المشاركة */}
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    alert('تم نسخ رابط القناة بنجاح! 🔗');
                  }}
                  className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-4 py-1.5 rounded-full hover:bg-blue-500/20 hover:scale-105 transition-all flex items-center gap-2"
                >
                  🔗 مشاركة
                </button>
              </div>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-2xl bg-black/50 p-4 rounded-xl border border-white/5">
                {streamerInfo.user?.bio || 'لا يوجد وصف (بايو)'}
              </p>
              
              {streamerInfo.livestream && (
                <div 
                  className="mt-4 inline-block px-4 py-2 rounded-l-lg font-bold text-sm transition-all duration-1000"
                  style={{ 
                    background: `linear-gradient(to left, transparent, rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.1))`,
                    borderRight: `4px solid ${c1}`,
                    color: c1
                  }}
                >
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
            <div 
              className={`${dataSaverMode ? 'w-full' : 'flex-[3]'} bg-black rounded-3xl overflow-hidden border border-white/10 relative group transition-all duration-1000`}
              style={{ boxShadow: `0 0 30px rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.08)` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10"></div>
              <iframe
                src={`https://player.kick.com/${streamerInfo.user?.username}?autoplay=true`}
                className="w-full h-full relative z-0"
                allowFullScreen
              ></iframe>
            </div>
            
            {/* الشات (يختفي في وضع التوفير) */}
            {!dataSaverMode && (
              <div className="flex-[1] bg-black/70 backdrop-blur-2xl rounded-3xl flex flex-col border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden relative min-w-0">
              {/* هيدر الشات */}
              <div 
                className="p-4 text-center font-black border-b border-white/10 tracking-widest uppercase relative z-10 shadow-md transition-all duration-1000 shrink-0"
                style={{ 
                  background: `linear-gradient(to right, #000, rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.08), #000)`,
                  color: c1
                }}
              >
                الشات المباشر 💬
                <div 
                  className="absolute bottom-0 left-0 h-[1px] w-full transition-all duration-1000"
                  style={{ background: `linear-gradient(to right, transparent, rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.5), transparent)` }}
                />
              </div>
              
              {/* الرسائل */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 relative z-10 scrollbar-hide min-w-0">
                {chatMessages.length === 0 ? (
                  <div 
                    className="flex-1 flex items-center justify-center text-sm font-bold animate-pulse transition-all duration-1000"
                    style={{ color: `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.3)` }}
                  >
                    في انتظار الرسائل...
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className="text-[14px] bg-white/5 p-3 rounded-2xl border border-white/5 transition-colors animate-[slide-in-right_0.3s_ease-out] min-w-0"
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.05)`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    >
                      <span 
                        className="font-black drop-shadow-md text-[15px]" 
                        style={{ color: msg.sender?.identity?.color || c1 }}
                      >
                        {msg.sender?.username}
                      </span>
                      <span className="text-white/30 mx-1">:</span>
                      <span className="text-white/90 leading-relaxed" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {parseEmotes(msg.content)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              
              {/* زينة أسفل الشات */}
              <div 
                className="h-2 w-full transition-all duration-1000 shrink-0"
                style={{ background: `linear-gradient(to right, transparent, rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.4), transparent)` }}
              />
            </div>
            )}
          </div>
        )}

        {/* الفوتر - معلومات الاستهلاك */}
        <div className="mt-16 pt-8 pb-4 text-center">
          <div className="inline-flex flex-wrap justify-center gap-4 text-sm font-bold bg-black/40 backdrop-blur-md p-5 rounded-2xl border border-white/5 shadow-lg">
            <div className="flex items-center gap-2 text-white/70">
              <span className="text-xl">📡</span>
              سرعة الإنترنت المطلوبة: <span className="text-[#09d598]">5 Mbps+</span>
            </div>
            <div className="w-px h-5 bg-white/20 hidden md:block mt-1"></div>
            <div className="flex items-center gap-2 text-white/70">
              <span className="text-xl">📊</span>
              الاستهلاك العادي: <span className="text-orange-400">~15 MB/دقيقة</span>
            </div>
            <div className="w-px h-5 bg-white/20 hidden md:block mt-1"></div>
            <div className="flex items-center gap-2 text-white/70">
              <span className="text-xl">⚡</span>
              وضع التوفير: <span className="text-green-400">يوفر بيانات كبيرة بإيقاف الشات والخلفيات</span>
            </div>
          </div>
        </div>
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