import { useEffect, useState } from 'react';
import { accountRequest } from './accountApi';

export default function useGearsetUpdates(user, scope, onChange) {
  const [status, setStatus] = useState('Connecting');

  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    let client;
    let timer;

    function refreshSoon() {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 150);
    }

    function authorize() {
      return accountRequest(user, 'gearsetRealtime', { scope }, { signal: controller.signal });
    }

    async function connect() {
      try {
        const [{ createClient }, initial] = await Promise.all([import('@ably/pubsub-device'), authorize()]);
        if (controller.signal.aborted) return;

        let firstToken = initial.tokenRequest;
        client = createClient({
          autoConnect: false,
          transports: ['web_socket'],
          authCallback: async (_params, callback) => {
            try {
              const request = firstToken || (await authorize()).tokenRequest;
              firstToken = null;
              callback(null, request);
            } catch (error) {
              callback(error.message, null);
            }
          }
        });

        const channel = client.channels.get(initial.channel);
        const attached = () => {
          if (controller.signal.aborted) return;
          setStatus('Live');
          refreshSoon();
        };
        channel.on('attached', attached);
        client.connection.on('connected', () => {
          if (channel.state === 'attached') attached();
        });
        client.connection.on(['disconnected', 'suspended'], () => {
          if (!controller.signal.aborted) setStatus('Reconnecting');
        });
        client.connection.on('failed', () => {
          if (!controller.signal.aborted) setStatus('Unavailable');
        });
        client.connect();
        await channel.subscribe('changed', refreshSoon);
      } catch {
        if (!controller.signal.aborted) setStatus('Unavailable');
      }
    }

    connect();
    return () => {
      controller.abort();
      clearTimeout(timer);
      client?.close();
    };
  }, [user, scope, onChange]);

  return scope ? status : null;
}
