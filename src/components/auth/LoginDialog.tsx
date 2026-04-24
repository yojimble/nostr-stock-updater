// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLoginActions } from '@/hooks/useLoginActions';
import { cn } from '@/lib/utils';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignup?: () => void;
}

async function waitForNostrExtension(timeoutMs = 1500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && 'nostr' in window) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return 'nostr' in window;
}

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin, onSignup: _onSignup }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [bunkerUri, setBunkerUri] = useState('');
  const [hasExtension, setHasExtension] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'nostr' in window,
  );
  const [errors, setErrors] = useState<{
    bunker?: string;
    extension?: string;
  }>({});
  const login = useLoginActions();

  // Some NIP-07 extensions (Alby, nos2x-fox, etc.) inject `window.nostr`
  // asynchronously after the document loads. Poll briefly when the dialog
  // opens so we don't falsely report the extension as missing.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    waitForNostrExtension(2000).then((found) => {
      if (!cancelled) setHasExtension(found);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Reset all state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setBunkerUri('');
      setErrors({});
    }
  }, [isOpen]);

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setErrors(prev => ({ ...prev, extension: undefined }));

    try {
      const present = await waitForNostrExtension(2000);
      if (!present) {
        throw new Error(
          'No NIP-07 extension detected. Install Alby or nos2x, make sure it is enabled for this site, then reload the page.',
        );
      }
      setHasExtension(true);
      await login.extension();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Extension login failed:', error);
      setErrors(prev => ({
        ...prev,
        extension: error instanceof Error ? error.message : 'Extension login failed'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setErrors(prev => ({ ...prev, bunker: 'Please enter a bunker URI' }));
      return;
    }

    if (!validateBunkerUri(bunkerUri)) {
      setErrors(prev => ({ ...prev, bunker: 'Invalid bunker URI format. Must start with bunker://' }));
      return;
    }

    setIsLoading(true);
    setErrors(prev => ({ ...prev, bunker: undefined }));

    try {
      await login.bunker(bunkerUri);
      onLogin();
      onClose();
      setBunkerUri('');
    } catch {
      setErrors(prev => ({
        ...prev,
        bunker: 'Failed to connect to bunker. Please check the URI.'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const defaultTab = hasExtension ? 'extension' : 'bunker';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn("max-w-[95vw] sm:max-w-md max-h-[90vh] max-h-[90dvh] p-0 overflow-hidden rounded-2xl overflow-y-scroll")}
      >
        <DialogHeader className={cn('px-6 pt-6 pb-1 relative')}>
            <DialogDescription className="text-center">
              Sign up or log in to continue
            </DialogDescription>
        </DialogHeader>
        <div className='px-6 pt-2 pb-4 space-y-4 overflow-y-auto flex-1'>
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/80 rounded-lg mb-4">
              <TabsTrigger value="extension" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Extension</span>
              </TabsTrigger>
              <TabsTrigger value="bunker" className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                <span>Bunker</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value='extension' className='space-y-3 bg-muted'>
              {errors.extension && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errors.extension}</AlertDescription>
                </Alert>
              )}
              <div className='text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800'>
                <Shield className='w-12 h-12 mx-auto mb-3 text-primary' />
                <p className='text-sm text-gray-600 dark:text-gray-300 mb-4'>
                  Login with one click using the browser extension
                </p>
                <div className="flex justify-center">
                  <Button
                    className='w-full rounded-full py-4'
                    onClick={handleExtensionLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Logging in...' : 'Login with Extension'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value='bunker' className='space-y-3 bg-muted'>
              <div className='space-y-2'>
                <label htmlFor='bunkerUri' className='text-sm font-medium text-gray-700 dark:text-gray-400'>
                  Bunker URI
                </label>
                <Input
                  id='bunkerUri'
                  value={bunkerUri}
                  onChange={(e) => {
                    setBunkerUri(e.target.value);
                    if (errors.bunker) setErrors(prev => ({ ...prev, bunker: undefined }));
                  }}
                  className={`rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary ${
                    errors.bunker ? 'border-red-500' : ''
                  }`}
                  placeholder='bunker://'
                  autoComplete="off"
                />
                {errors.bunker && (
                  <p className="text-sm text-red-500">{errors.bunker}</p>
                )}
              </div>

              <div className="flex justify-center">
                <Button
                  className='w-full rounded-full py-4'
                  onClick={handleBunkerLogin}
                  disabled={isLoading || !bunkerUri.trim()}
                >
                  {isLoading ? 'Connecting...' : 'Login with Bunker'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
    );
  };

export default LoginDialog;
