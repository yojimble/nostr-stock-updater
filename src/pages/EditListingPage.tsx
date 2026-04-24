import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Paperclip, Trash2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useListing } from '@/hooks/useListing';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';

type Spec = { name: string; value: string };

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([t]) => t === name)?.[1];
}

export default function EditListingPage() {
  const { d: rawD } = useParams<{ d: string }>();
  const d = rawD ? decodeURIComponent(rawD) : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { user } = useCurrentUser();
  const { data: listing, isLoading, isError } = useListing(d);
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [status, setStatus] = useState<'active' | 'sold'>('active');
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imetaTags, setImetaTags] = useState<string[][]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preserve the original published_at so "first published" stays stable across edits.
  const originalPublishedAt = useMemo(() => {
    if (!listing) return undefined;
    return tagValue(listing.tags, 'published_at') ?? String(listing.created_at);
  }, [listing]);

  useSeoMeta({
    title: title ? `Edit: ${title}` : 'Edit listing',
  });

  useEffect(() => {
    if (!listing) return;
    const t = listing.tags;
    setTitle(tagValue(t, 'title') ?? '');
    setSummary(tagValue(t, 'summary') ?? '');
    setDescription(listing.content ?? '');
    const priceTag = t.find(([name]) => name === 'price');
    setPrice(priceTag?.[1] ?? '');
    setCurrency(priceTag?.[2] ?? 'USD');
    setLocation(tagValue(t, 'location') ?? '');
    setCategory(t.find(([name]) => name === 't')?.[1] ?? '');
    setStock(tagValue(t, 'stock') ?? tagValue(t, 'quantity') ?? '');
    const s = tagValue(t, 'status');
    setStatus(s === 'sold' ? 'sold' : 'active');
    setSpecs(
      t
        .filter(([name]) => name === 'spec')
        .map(([, name, value]) => ({ name: name ?? '', value: value ?? '' })),
    );
    setImageUrl(tagValue(t, 'image') ?? '');
    setImetaTags(t.filter(([name]) => name === 'imeta'));
  }, [listing]);

  const isSubmitting = isPublishing || isUploading;
  const disabled = !listing || isSubmitting;

  const handleSelectImage = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImageFile(f);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImageUrl('');
    setImetaTags([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !listing || !d) return;

    if (!title.trim() || !summary.trim() || !description.trim()) {
      toast.error('Title, summary, and description are required.');
      return;
    }

    let nextImageUrl = imageUrl;
    let nextImetaTags = imetaTags;

    if (imageFile) {
      try {
        const [[, url], ...rest] = await uploadFile(imageFile);
        nextImageUrl = url;
        nextImetaTags = rest;
      } catch (err) {
        toast.error(`Image upload failed: ${(err as Error).message}`);
        return;
      }
    }

    const tags: string[][] = [
      ['d', d],
      ['title', title.trim()],
      ['summary', summary.trim()],
      ['status', status],
    ];
    if (originalPublishedAt) tags.push(['published_at', originalPublishedAt]);
    if (price.trim()) tags.push(['price', price.trim(), currency.trim() || 'USD']);
    if (location.trim()) tags.push(['location', location.trim()]);
    if (category.trim()) tags.push(['t', category.trim().toLowerCase()]);
    if (stock.trim()) tags.push(['stock', stock.trim()]);
    for (const s of specs) {
      if (s.name.trim() && s.value.trim()) {
        tags.push(['spec', s.name.trim(), s.value.trim()]);
      }
    }
    if (nextImageUrl) {
      tags.push(['image', nextImageUrl]);
      tags.push(...nextImetaTags);
    }

    try {
      await publishEvent({
        kind: 30402,
        content: description.trim(),
        tags,
      });
      toast.success('Listing updated and republished.');
      await queryClient.invalidateQueries({ queryKey: ['nip99-listings'] });
      await queryClient.invalidateQueries({ queryKey: ['nip99-listing'] });
      navigate('/');
    } catch (err) {
      toast.error(`Failed to publish: ${(err as Error).message}`);
    }
  };

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Please sign in to edit listings.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to listings
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit listing</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {isError && <p className="text-sm text-destructive">Failed to load listing.</p>}
          {!isLoading && !listing && !isError && (
            <p className="text-sm text-muted-foreground">
              No listing found with that identifier.
            </p>
          )}

          {listing && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Summary *</Label>
                <Input
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  disabled={disabled}
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="w-28 space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as 'active' | 'sold')}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Specifications</Label>
                <div className="space-y-2">
                  {specs.map((spec, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Name"
                        value={spec.name}
                        onChange={(e) =>
                          setSpecs((prev) =>
                            prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                          )
                        }
                        disabled={disabled}
                      />
                      <Input
                        placeholder="Value"
                        value={spec.value}
                        onChange={(e) =>
                          setSpecs((prev) =>
                            prev.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)),
                          )
                        }
                        disabled={disabled}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSpecs((prev) => prev.filter((_, j) => j !== i))}
                        disabled={disabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {specs.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSpecs((prev) => [...prev, { name: '', value: '' }])}
                      disabled={disabled}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add spec
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Image</Label>
                {imageUrl && !imageFile && (
                  <div className="flex items-center gap-3">
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-20 w-20 rounded-md object-cover bg-muted"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveImage}
                      disabled={disabled}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {imageFile && (
                  <div className="text-sm text-muted-foreground">
                    New image queued: {imageFile.name}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectImage}
                    disabled={disabled}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    {imageUrl || imageFile ? 'Replace image' : 'Add image'}
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button asChild type="button" variant="ghost" disabled={isSubmitting}>
                  <Link to="/">Cancel</Link>
                </Button>
                <Button type="submit" disabled={disabled}>
                  {isSubmitting ? 'Publishing…' : 'Save & republish'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
