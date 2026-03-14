import React from 'react';

export type IconName = 
  | 'all' | 'contacts' | 'chats' | 'favorites' | 'folder' 
  | 'bitcoin' | 'ethereum' | 'trending-up' | 'hash' | 'book' 
  | 'trophy' | 'layers' | 'archive' | 'settings' | 'search' | 'plus';

interface IconProps {
  name: IconName | string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Icon = ({ name, size = 20, className, style }: IconProps) => {
  const getPath = () => {
    switch (name) {
      case 'all':
        return <path d="M4 6h16M4 12h16M4 18h16" />;
      case 'contacts':
        return <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>;
      case 'chats':
        return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
      case 'favorites':
        return <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />;
      case 'folder':
        return <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />;
      case 'bitcoin':
        return <><path d="M11.75 8a2.5 2.5 0 1 0 0 5h1.25a2.5 2.5 0 1 0 0-5h-1.25Z" /><path d="M11.75 13a2.5 2.5 0 1 0 0 5h1.25a2.5 2.5 0 1 0 0-5h-1.25Z" /><path d="M8 8h11.25" /><path d="M8 13h11.25" /><path d="M8 18h11.25" /><path d="M10.5 5v14" /><path d="M13 5v14" /></>;
      case 'ethereum':
        return <path d="m12 1 7 11-7 11-7-11zm0 22v-8m0-14v5m-7 6 7 3 7-3" />;
      case 'trending-up':
        return <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />;
      case 'hash':
        return <line x1="4" y1="9" x2="20" y2="9" />; // Simplified, will add more below
      case 'book':
        return <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />; // Simplified
      case 'trophy':
        return <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />; // Simplified
      case 'layers':
        return <polygon points="12 2 2 7 12 12 22 7 12 2" />; // Simplified
      case 'archive':
        return <polyline points="21 8 21 21 3 21 3 8" />; // Simplified
      case 'settings':
        return <circle cx="12" cy="12" r="3" />; // Simplified
      case 'plus':
        return <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>;
      default:
        // Default hashtag/general if unknown but matches Bitcoin aesthetic
        return <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>;
    }
  };

  // Re-define some complex paths for better look
  const renderIcon = () => {
     if (name === 'hash') {
        return <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>;
     }
     if (name === 'book') {
        return <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>;
     }
     if (name === 'trophy') {
        return <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>;
     }
     if (name === 'layers') {
        return <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 12 12 17 22 12" /><polyline points="2 17 12 22 22 17" /></>;
     }
     if (name === 'archive') {
        return <><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>;
     }
     if (name === 'settings') {
        return <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>;
     }
     if (name === 'search') {
        return <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>;
     }
     return getPath();
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {renderIcon()}
    </svg>
  );
};
