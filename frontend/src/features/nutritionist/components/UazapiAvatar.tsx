import { useEffect, useRef, useState } from "react";
import { initials } from "../../../lib/formatters";
import { uazapiAvatar } from "../uazapi-api";

export function UazapiAvatar({
  token,
  chatId,
  title,
  connected,
}: {
  token: string;
  chatId: string;
  title: string;
  connected: boolean;
}) {
  const target = useRef<HTMLElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const node = target.current;
    if (!connected || !node || typeof IntersectionObserver === "undefined")
      return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void uazapiAvatar(token, chatId)
        .then((result) => {
          if (active && result.url?.startsWith("https://")) setUrl(result.url);
        })
        .catch(() => {});
    });
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [chatId, connected, token]);

  return (
    <b className="uazapi-avatar" ref={target} aria-hidden="true">
      {url ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setUrl(null)}
        />
      ) : (
        initials(title)
      )}
    </b>
  );
}
