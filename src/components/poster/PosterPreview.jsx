

const getFontClass = (fontStyle) => {
  const fonts = {
    serif: "font-serif",
    sans: "font-sans",
    modern: "font-light tracking-tight",
    elegant: "font-serif italic"
  };
  return fonts[fontStyle] || "font-serif";
};

const getColorPalette = (palette) => {
  const palettes = {
    default: {
      primary: "slate-900",
      secondary: "amber-400",
      accent: "emerald-700",
      bg: "slate-50"
    },
    "navy-gold": {
      primary: "blue-900",
      secondary: "yellow-500",
      accent: "blue-700",
      bg: "blue-50"
    },
    "forest-cream": {
      primary: "green-900",
      secondary: "amber-200",
      accent: "green-700",
      bg: "green-50"
    },
    "burgundy-tan": {
      primary: "red-900",
      secondary: "orange-300",
      accent: "red-700",
      bg: "red-50"
    },
    "slate-amber": {
      primary: "slate-800",
      secondary: "amber-500",
      accent: "slate-600",
      bg: "slate-100"
    },
    "teal-coral": {
      primary: "teal-900",
      secondary: "coral-400",
      accent: "teal-700",
      bg: "teal-50"
    }
  };
  return palettes[palette] || palettes.default;
};

const ClassicStyle = ({ posterData }) => {
  const colors = getColorPalette(posterData.colorPalette);
  const fontClass = getFontClass(posterData.fontStyle);
  
  return (
  <div className="h-full flex flex-col relative overflow-hidden">
    {/* Background Image or Pattern */}
    {posterData.backgroundImageUrl ? (
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${posterData.backgroundImageUrl})` }}
      ></div>
    ) : (
      <div className={`absolute inset-0 bg-gradient-to-br from-${colors.bg} via-white to-${colors.bg}`}></div>
    )}
    <div className="absolute top-0 right-0 w-full h-full opacity-5">
      <div className="absolute top-10 right-10 w-64 h-64 border-2 border-slate-300 rounded-full"></div>
      <div className="absolute top-20 right-20 w-48 h-48 border-2 border-slate-300 rounded-full"></div>
    </div>
    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-100/50 to-transparent"></div>
    
    {/* Diagonal Banner */}
    {posterData.showBanner && posterData.bannerText && (
      <div className="absolute top-8 -right-12 z-20 rotate-45 w-64">
        <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white px-4 py-2 text-center border-y-2 border-amber-400 shadow-2xl">
          <p className="font-bold text-sm uppercase tracking-widest">{posterData.bannerText}</p>
        </div>
      </div>
    )}
    
    <div className="relative z-10 flex flex-col h-full p-8">

      <div className="flex justify-center mb-8">
        <div className="bg-[#1a2d5a] rounded-xl p-4 shadow-xl">
          <img 
            src={posterData.customLogoUrl || posterData.orgLogoUrl} 
            alt="Logo" 
            className="h-20 object-contain" 
          />
        </div>
      </div>

      <div className="text-center mb-10 relative">
        <div className={`absolute top-1/2 left-0 right-0 h-px bg-${colors.secondary}/30`}></div>
        <h1 className={`text-4xl ${fontClass} font-bold text-${colors.primary} mb-3 relative bg-white inline-block px-6`}>
          Parlor Meeting
        </h1>
        <div className="flex justify-center gap-2 mt-4">
          <div className={`w-3 h-3 rotate-45 bg-${colors.secondary}`}></div>
          <div className={`w-3 h-3 rotate-45 bg-${colors.primary}`}></div>
          <div className={`w-3 h-3 rotate-45 bg-${colors.secondary}`}></div>
        </div>
      </div>

      <div className="space-y-6 text-center flex-1">
        {posterData.guestSpeaker && (
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-lg shadow-md border border-slate-200/50">
            <p className={`text-xs text-${colors.accent} uppercase tracking-widest mb-2 font-semibold`}>Guest Speaker</p>
            <p className={`text-3xl ${fontClass} font-bold text-${colors.primary}`}>{posterData.guestSpeaker}</p>
          </div>
        )}

        {posterData.date && (
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-2 font-semibold">Date</p>
            <p className="text-xl font-medium text-slate-800">{posterData.date}</p>
          </div>
        )}

        {posterData.time && (
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-2 font-semibold">Time</p>
            <p className="text-xl font-medium text-slate-800">
              {posterData.time.includes(':') 
                ? new Date(`2000-01-01T${posterData.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : posterData.time
              }
            </p>
          </div>
        )}

        {posterData.hostName && (
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-2 font-semibold">At the Home of</p>
            <p className="text-2xl font-serif text-slate-900">{posterData.hostName}</p>
          </div>
        )}

        {posterData.address && (
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-2 font-semibold">Address</p>
            <p className="text-lg text-slate-700 whitespace-pre-line leading-relaxed">{posterData.address}</p>
          </div>
        )}

        {posterData.coHosts && (
          <div>
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-2 font-semibold">Co-hosts</p>
            <p className="text-base text-slate-700 whitespace-pre-line leading-relaxed">{posterData.coHosts}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 border-t-2 border-amber-400/40">
        <p className="text-center text-sm font-bold text-slate-900 tracking-wide">{posterData.orgName}</p>
        <p className="text-center text-xs text-slate-600 mt-1">13 King David Dr. Lakewood NJ 08701</p>
      </div>
    </div>
  </div>
  );
};

const ModernStyle = ({ posterData }) => {
  const colors = getColorPalette(posterData.colorPalette);
  const fontClass = getFontClass(posterData.fontStyle);
  
  return (
  <div className="h-full flex flex-col relative overflow-hidden">
    {/* Background Image or Gradient */}
    {posterData.backgroundImageUrl ? (
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${posterData.backgroundImageUrl})` }}
      ></div>
    ) : (
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-400 to-cyan-500"></div>
    )}
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTEwaC0xMnYyaDEydi0yem0wLTEwSDI0djJoMTJ2LTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
    
    {/* Diagonal Banner */}
    {posterData.showBanner && posterData.bannerText && (
      <div className="absolute top-8 -right-12 z-20 rotate-45 w-64">
        <div className="bg-white/95 backdrop-blur-sm text-emerald-900 px-4 py-2 text-center rounded-lg shadow-2xl border-2 border-white/50">
          <p className="font-bold text-sm uppercase tracking-wider">{posterData.bannerText}</p>
        </div>
      </div>
    )}
    
    <div className="relative z-10 flex flex-col h-full p-8">

      <div className="flex justify-center mb-8">
        <div className="bg-white rounded-2xl p-4 shadow-2xl">
          <img src={posterData.customLogoUrl || posterData.orgLogoUrl} alt="Logo" className="h-20 object-contain" />
        </div>
      </div>

      <div className="text-center mb-10 bg-white/95 backdrop-blur-sm py-6 px-4 rounded-3xl shadow-xl">
        <h1 className={`text-5xl ${fontClass} text-${colors.primary} tracking-tight`}>Parlor Meeting</h1>
        <div className="w-32 h-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 mx-auto rounded-full mt-4"></div>
      </div>

      <div className="space-y-5 text-center flex-1">
        {posterData.guestSpeaker && (
          <div className="bg-white/95 backdrop-blur-sm p-5 rounded-2xl shadow-lg border-l-4 border-emerald-500">
            <p className="text-xs text-emerald-700 uppercase tracking-widest mb-2 font-bold">Guest Speaker</p>
            <p className="text-3xl font-light text-slate-900">{posterData.guestSpeaker}</p>
          </div>
        )}

        {posterData.date && (
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-md">
            <p className="text-xs text-teal-700 uppercase tracking-widest mb-2 font-bold">Date</p>
            <p className="text-xl font-medium text-slate-800">{posterData.date}</p>
          </div>
        )}

        {posterData.time && (
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-md">
            <p className="text-xs text-teal-700 uppercase tracking-widest mb-2 font-bold">Time</p>
            <p className="text-xl font-medium text-slate-800">
              {posterData.time.includes(':') 
                ? new Date(`2000-01-01T${posterData.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : posterData.time
              }
            </p>
          </div>
        )}

        {posterData.hostName && (
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-md">
            <p className="text-xs text-teal-700 uppercase tracking-widest mb-2 font-bold">At the Home of</p>
            <p className="text-2xl font-light text-slate-900">{posterData.hostName}</p>
          </div>
        )}

        {posterData.address && (
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-md">
            <p className="text-xs text-teal-700 uppercase tracking-widest mb-2 font-bold">Address</p>
            <p className="text-lg text-slate-700 whitespace-pre-line leading-relaxed">{posterData.address}</p>
          </div>
        )}

        {posterData.coHosts && (
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-md">
            <p className="text-xs text-teal-700 uppercase tracking-widest mb-2 font-bold">Co-hosts</p>
            <p className="text-base text-slate-700 whitespace-pre-line leading-relaxed">{posterData.coHosts}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-xl">
        <p className="text-center text-sm font-bold text-slate-900 tracking-wide">{posterData.orgName}</p>
        <p className="text-center text-xs text-slate-600 mt-1">13 King David Dr. Lakewood NJ 08701</p>
      </div>
    </div>
  </div>
  );
};

const ElegantStyle = ({ posterData }) => {
  const colors = getColorPalette(posterData.colorPalette);
  const fontClass = getFontClass(posterData.fontStyle);
  
  return (
  <div className="h-full flex flex-col relative overflow-hidden">
    {/* Background Image or Elegant Pattern */}
    {posterData.backgroundImageUrl ? (
      <>
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${posterData.backgroundImageUrl})` }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-orange-50/80 to-yellow-50/80"></div>
      </>
    ) : (
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50"></div>
    )}
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2Q5N2QwZCIgb3BhY2l0eT0iMC4wMyIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-100"></div>
    <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
    <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
    
    {/* Diagonal Banner */}
    {posterData.showBanner && posterData.bannerText && (
      <div className="absolute top-8 -right-12 z-20 rotate-45 w-64">
        <div className="bg-[#1a2d5a] text-amber-300 px-4 py-2 text-center relative shadow-2xl">
          <div className="absolute top-0 left-4 right-4 h-px bg-amber-400/50"></div>
          <div className="absolute bottom-0 left-4 right-4 h-px bg-amber-400/50"></div>
          <p className="font-serif font-bold text-sm uppercase tracking-[0.3em]">{posterData.bannerText}</p>
        </div>
      </div>
    )}
    
    <div className="relative z-10 flex flex-col h-full p-8">

      <div className="flex justify-center mb-8">
        <div className={`bg-${colors.primary} rounded-lg p-4 shadow-2xl border-2 border-${colors.secondary}/40`}>
          <img src={posterData.customLogoUrl || posterData.orgLogoUrl} alt="Logo" className="h-20 object-contain" />
        </div>
      </div>

      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className={`w-20 h-px bg-gradient-to-r from-transparent to-${colors.secondary}`}></div>
          <div className={`w-3 h-3 rotate-45 bg-${colors.secondary} shadow-lg`}></div>
          <div className={`w-20 h-px bg-gradient-to-l from-transparent to-${colors.secondary}`}></div>
        </div>
        <h1 className={`text-4xl ${fontClass} text-${colors.primary} mb-4 drop-shadow-sm`}>Parlor Meeting</h1>
        <div className="flex items-center justify-center gap-4">
          <div className="w-20 h-px bg-gradient-to-r from-transparent to-amber-500"></div>
          <div className="w-3 h-3 rotate-45 bg-amber-500 shadow-lg"></div>
          <div className="w-20 h-px bg-gradient-to-l from-transparent to-amber-500"></div>
        </div>
      </div>

      <div className="space-y-7 text-center flex-1">
        {posterData.guestSpeaker && (
          <div className="relative bg-white/70 backdrop-blur-sm p-5 rounded-lg shadow-md">
            <div className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-amber-500 to-transparent"></div>
            <div className="absolute -right-2 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-amber-500 to-transparent"></div>
            <p className="text-xs text-amber-700 font-serif italic mb-3">Guest Speaker</p>
            <p className="text-3xl font-serif font-bold text-[#1a2d5a]">{posterData.guestSpeaker}</p>
          </div>
        )}

        {posterData.date && (
          <div>
            <p className="text-xs text-amber-700 font-serif italic mb-2">Date</p>
            <p className="text-xl font-serif text-slate-800">{posterData.date}</p>
          </div>
        )}

        {posterData.time && (
          <div>
            <p className="text-xs text-amber-700 font-serif italic mb-2">Time</p>
            <p className="text-xl font-serif text-slate-800">
              {posterData.time.includes(':') 
                ? new Date(`2000-01-01T${posterData.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : posterData.time
              }
            </p>
          </div>
        )}

        {posterData.hostName && (
          <div>
            <p className="text-xs text-amber-700 font-serif italic mb-2">At the Home of</p>
            <p className="text-2xl font-serif text-slate-900">{posterData.hostName}</p>
          </div>
        )}

        {posterData.address && (
          <div>
            <p className="text-xs text-amber-700 font-serif italic mb-2">Address</p>
            <p className="text-lg font-serif text-slate-700 whitespace-pre-line leading-relaxed">{posterData.address}</p>
          </div>
        )}

        {posterData.coHosts && (
          <div>
            <p className="text-xs text-amber-700 font-serif italic mb-2">Co-hosts</p>
            <p className="text-base font-serif text-slate-700 whitespace-pre-line leading-relaxed">{posterData.coHosts}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6">
        <div className="border-t border-b border-amber-400/40 py-3 bg-white/50 backdrop-blur-sm">
          <p className="text-center text-sm font-serif font-bold text-[#1a2d5a] tracking-wider">{posterData.orgName}</p>
          <p className="text-center text-xs font-serif text-slate-600 mt-1">13 King David Dr. Lakewood NJ 08701</p>
        </div>
      </div>
    </div>
  </div>
  );
};

const MinimalistStyle = ({ posterData }) => {
  const colors = getColorPalette(posterData.colorPalette);
  const fontClass = getFontClass(posterData.fontStyle);
  
  return (
  <div className="h-full flex flex-col relative overflow-hidden">
    {/* Background Image or Clean White */}
    {posterData.backgroundImageUrl ? (
      <>
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{ backgroundImage: `url(${posterData.backgroundImageUrl})` }}
        ></div>
        <div className="absolute inset-0 bg-white/90"></div>
      </>
    ) : (
      <div className="absolute inset-0 bg-white"></div>
    )}
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0iIzAwMCIgb3BhY2l0eT0iMC4wMiIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-100"></div>
    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-slate-900 via-slate-400 to-slate-900"></div>
    
    {/* Diagonal Banner */}
    {posterData.showBanner && posterData.bannerText && (
      <div className="absolute top-8 -right-12 z-20 rotate-45 w-64">
        <div className="border-l-4 border-slate-900 bg-slate-50 px-4 py-2 text-center shadow-2xl">
          <p className="font-light text-sm uppercase tracking-[0.2em] text-slate-900">{posterData.bannerText}</p>
        </div>
      </div>
    )}
    
    <div className="relative z-10 flex flex-col h-full p-10">

      <div className="flex justify-start mb-12">
        <div className={`bg-${colors.primary} p-3 shadow-lg`}>
          <img src={posterData.customLogoUrl || posterData.orgLogoUrl} alt="Logo" className="h-16 object-contain" />
        </div>
      </div>

      <div className="mb-12">
        <h1 className={`text-5xl ${fontClass} text-${colors.primary} tracking-tight leading-tight`}>Parlor<br/>Meeting</h1>
        <div className={`w-16 h-0.5 bg-${colors.primary} mt-4`}></div>
      </div>

      <div className="space-y-8 flex-1">
        {posterData.guestSpeaker && (
          <div className="border-l-2 border-slate-300 pl-6 bg-slate-50/50 py-2">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">Guest Speaker</p>
            <p className="text-3xl font-light text-slate-900 leading-tight">{posterData.guestSpeaker}</p>
          </div>
        )}

        {posterData.date && (
          <div className="border-l-2 border-slate-300 pl-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">Date</p>
            <p className="text-xl font-light text-slate-800">{posterData.date}</p>
          </div>
        )}

        {posterData.time && (
          <div className="border-l-2 border-slate-300 pl-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">Time</p>
            <p className="text-xl font-light text-slate-800">
              {posterData.time.includes(':') 
                ? new Date(`2000-01-01T${posterData.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : posterData.time
              }
            </p>
          </div>
        )}

        {posterData.hostName && (
          <div className="border-l-2 border-slate-300 pl-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">At the Home of</p>
            <p className="text-2xl font-light text-slate-900">{posterData.hostName}</p>
          </div>
        )}

        {posterData.address && (
          <div className="border-l-2 border-slate-300 pl-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">Address</p>
            <p className="text-lg font-light text-slate-700 whitespace-pre-line leading-relaxed">{posterData.address}</p>
          </div>
        )}

        {posterData.coHosts && (
          <div className="border-l-2 border-slate-300 pl-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-light">Co-hosts</p>
            <p className="text-base font-light text-slate-700 whitespace-pre-line leading-relaxed">{posterData.coHosts}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-8">
        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-light text-slate-900 tracking-wide">{posterData.orgName}</p>
          <p className="text-xs font-light text-slate-500 mt-1">13 King David Dr. Lakewood NJ 08701</p>
        </div>
      </div>
    </div>
  </div>
  );
};

export default function PosterPreview({ posterData, style }) {
  const styles = {
    classic: ClassicStyle,
    modern: ModernStyle,
    elegant: ElegantStyle,
    minimalist: MinimalistStyle
  };

  const SelectedStyle = styles[style] || ClassicStyle;

  return (
    <div 
      className="bg-white border-2 border-gray-300 shadow-xl mx-auto overflow-hidden"
      style={{ 
        aspectRatio: "11/17",
        maxWidth: "100%",
        width: "440px"
      }}
    >
      <SelectedStyle posterData={posterData} />
    </div>
  );
}