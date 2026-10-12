import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Check,
  AlertTriangle,
  Save,
  Upload,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { Button, Input, Textarea, Badge, Spinner, showToast } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { ImageField } from './ImageField';
import { GalleryEditor } from './GalleryEditor';
import { HoursEditor } from './HoursEditor';
import { DesignPicker } from './DesignPicker';
import { LivePreview, type PreviewDevice } from './LivePreview';
import {
  websiteService,
  previewUrl,
  publicUrl,
  type EditorState,
  type WebsiteForm,
  type ReadinessItem,
} from '../../services/website';
import { t } from '../../i18n';

/** Steps, in the order a page is actually built. */
const STEPS = ['identity', 'design', 'content', 'visit', 'booking', 'seo'] as const;
type Step = (typeof STEPS)[number];

/**
 * Which step each readiness key belongs to, so a gap is reported where it is
 * fixed rather than in one undifferentiated list at the bottom of the page.
 */
const STEP_OF_KEY: Record<string, Step> = {
  restaurant_name: 'identity',
  logo: 'design',
  hero_image: 'design',
  hero_title: 'design',
  hero_description: 'design',
  story: 'content',
  gallery: 'content',
  menu: 'content',
  address: 'visit',
  phone: 'visit',
  map_url: 'visit',
  hours: 'visit',
  seo_description: 'seo',
};

/** A slug Frappe will accept: lowercase, digits, single hyphens. */
export function slugify(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function emptyForm(state: EditorState): WebsiteForm {
  const restaurant = state.restaurant ?? '';
  return {
    slug: '',
    restaurant,
    restaurant_name: restaurant,
    language: 'ar',
    theme: 'Olive',
    layout: 'Classic',
    logo: null,
    hero_image: null,
    eyebrow: '',
    hero_title: '',
    hero_description: '',
    show_story: 1,
    story_title: '',
    story: '',
    story_image: null,
    show_menu: 1,
    menu: null,
    menu_note: '',
    address: '',
    phone: '',
    map_url: '',
    instagram_url: '',
    enable_reservations: 0,
    duration_minutes: 90,
    lead_minutes: 60,
    advance_days: 14,
    max_guests: 8,
    booking_note: '',
    privacy_note: '',
    seo_title: '',
    seo_description: '',
    gallery: [],
    hours: [],
    ...(state.defaults as Partial<WebsiteForm>),
  };
}

function toForm(state: EditorState): WebsiteForm {
  const base = emptyForm(state);
  if (!state.website) return base;
  const website = state.website;
  const form: any = { ...base };
  for (const key of Object.keys(base)) form[key] = (website as any)[key] ?? (base as any)[key];
  form.gallery = website.gallery ?? [];
  form.hours = website.hours ?? [];
  return form as WebsiteForm;
}

const CheckRow: React.FC<{ item: ReadinessItem }> = ({ item }) => (
  <li className="flex items-start gap-2 text-sm">
    <AlertTriangle
      className={`mt-0.5 h-4 w-4 shrink-0 ${item.blocking ? 'text-red-600' : 'text-amber-500'}`}
    />
    <span className={item.blocking ? 'text-red-700' : 'text-gray-600'}>
      {t(`dash.website.checks.${item.key}`)}
    </span>
  </li>
);

export const WebsiteEditorPage: React.FC = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [form, setForm] = useState<WebsiteForm | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [step, setStep] = useState<Step>('identity');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [nonce, setNonce] = useState(() => Date.now());
  const slugTouched = useRef(false);

  const load = useCallback(async (restaurant?: string) => {
    setLoading(true);
    try {
      const next = await websiteService.getState(restaurant);
      setState(next);
      const asForm = toForm(next);
      setForm(asForm);
      setSaved(JSON.stringify(asForm));
      slugTouched.current = Boolean(next.website);
      setLoadError(false);
    } catch {
      // An editor that renders empty fields after a failed read invites a
      // manager to retype a page that already exists and save over it.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exists = Boolean(state?.website);
  const published = Boolean(state?.website?.published);
  const readOnly = Boolean(state && !state.can_write);
  const dirty = Boolean(form && JSON.stringify(form) !== saved);

  const set = useCallback(<K extends keyof WebsiteForm>(key: K, value: WebsiteForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  /**
   * Park the draft server-side and reload the frame.
   *
   * Debounced because every keystroke would otherwise be a request and a
   * reflow; 700ms is long enough to finish a word and short enough that the
   * preview still feels attached to the typing.
   */
  useEffect(() => {
    if (!form || !exists || !dirty || readOnly) return;
    const slug = state?.website?.slug;
    if (!slug) return;

    setSyncing(true);
    const timer = window.setTimeout(async () => {
      try {
        await websiteService.saveDraft(slug, form);
        setNonce(Date.now());
      } catch {
        // A preview that silently shows stale content is worse than one that
        // does not move, but this is not worth a toast on every keystroke.
      } finally {
        setSyncing(false);
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
      setSyncing(false);
    };
  }, [form, exists, dirty, readOnly, state?.website?.slug]);

  const missing = state?.website?.readiness ?? [];
  const blocking = missing.filter((item) => item.blocking);
  const stepIssues = useMemo(() => {
    const map: Record<string, ReadinessItem[]> = {};
    for (const item of missing) {
      const owner = STEP_OF_KEY[item.key] ?? 'identity';
      (map[owner] ||= []).push(item);
    }
    return map;
  }, [missing]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const next = await websiteService.save(form);
      setState((current) => (current ? { ...current, website: next } : current));
      const asForm = toForm({ ...(state as EditorState), website: next });
      setForm(asForm);
      setSaved(JSON.stringify(asForm));
      setNonce(Date.now());
      showToast({ message: t('dash.website.saved'), type: 'success' });
    } catch (error) {
      showToast({ message: parseFrappeError(error, t('dash.website.save_failed')), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (next: boolean) => {
    if (!form) return;
    setSaving(true);
    try {
      // Publishing what is on screen, not what was last saved: a manager who
      // edits and presses publish means both.
      if (dirty) await websiteService.save(form);
      const result = await websiteService.setPublished(form.slug, next);
      setState((current) => (current ? { ...current, website: result } : current));
      const asForm = toForm({ ...(state as EditorState), website: result });
      setForm(asForm);
      setSaved(JSON.stringify(asForm));
      setNonce(Date.now());
      showToast({
        message: next ? t('dash.website.published') : t('dash.website.unpublished'),
        type: 'success',
      });
    } catch (error) {
      showToast({
        message: parseFrappeError(error, t('dash.website.publish_failed')),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (loadError || !state || !form) {
    return <LoadErrorBanner onRetry={() => void load()} />;
  }

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {node}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );

  const toggle = (key: keyof WebsiteForm, label: string, hint?: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary-600"
        checked={Boolean(form[key])}
        disabled={readOnly}
        onChange={(e) => set(key, (e.target.checked ? 1 : 0) as never)}
      />
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );

  const number = (key: keyof WebsiteForm, label: string, hint?: string) =>
    field(
      label,
      <Input
        type="number"
        value={String(form[key] ?? '')}
        disabled={readOnly}
        onChange={(e) => set(key, Number(e.target.value) as never)}
      />,
      hint,
    );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary-50 p-2 text-primary-700">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('dash.website.title')}</h1>
            <p className="text-xs text-gray-500">{t('dash.website.subtitle')}</p>
          </div>
          {exists && (
            <Badge variant={published ? 'success' : 'pending'}>
              {published ? t('dash.website.state.published') : t('dash.website.state.draft')}
            </Badge>
          )}
          {dirty && <Badge variant="warning">{t('dash.website.state.unsaved')}</Badge>}
        </div>

        {exists && !readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleSave} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4 me-1" />
              {t('dash.website.save')}
            </Button>
            {published ? (
              <Button variant="secondary" onClick={() => handlePublish(false)} loading={saving}>
                <EyeOff className="h-4 w-4 me-1" />
                {t('dash.website.unpublish')}
              </Button>
            ) : (
              <Button
                onClick={() => handlePublish(true)}
                loading={saving}
                disabled={blocking.length > 0 && !dirty}
              >
                <Upload className="h-4 w-4 me-1" />
                {t('dash.website.publish')}
              </Button>
            )}
          </div>
        )}
      </header>

      {readOnly && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {t('dash.website.read_only')}
        </p>
      )}

      {!exists ? (
        <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 text-gray-800">
            <Sparkles className="h-5 w-5 text-primary-600" />
            <h2 className="text-base font-semibold">{t('dash.website.create.title')}</h2>
          </div>
          <p className="text-sm text-gray-600">{t('dash.website.create.intro')}</p>

          {field(
            t('dash.website.fields.restaurant'),
            <SearchableSelect
              id="restaurant"
              value={form.restaurant}
              options={state.restaurants.map((r) => ({ value: r.name, label: r.name }))}
              onChange={(_, value) => set('restaurant', value)}
              strict
            />,
          )}

          {field(
            t('dash.website.fields.display_name'),
            <Input
              value={form.restaurant_name}
              onChange={(e) => {
                set('restaurant_name', e.target.value);
                if (!slugTouched.current) set('slug', slugify(e.target.value));
              }}
            />,
          )}

          {field(
            t('dash.website.fields.slug'),
            <Input
              value={form.slug}
              onChange={(e) => {
                slugTouched.current = true;
                set('slug', slugify(e.target.value));
              }}
            />,
            t('dash.website.fields.slug_hint', { slug: form.slug || 'your-restaurant' }),
          )}

          <Button
            fullWidth
            onClick={handleSave}
            loading={saving}
            disabled={!form.slug || !form.restaurant || !form.restaurant_name}
          >
            {t('dash.website.create.action')}
          </Button>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <nav className="flex flex-wrap gap-1.5" aria-label={t('dash.website.steps_label')}>
              {STEPS.map((name, index) => {
                const issues = stepIssues[name] ?? [];
                const hasBlocking = issues.some((item) => item.blocking);
                const active = step === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    onClick={() => setStep(name)}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-primary-600 bg-primary-50 text-primary-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
                        hasBlocking
                          ? 'bg-red-100 text-red-700'
                          : issues.length
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700',
                      ].join(' ')}
                    >
                      {issues.length ? index + 1 : <Check className="h-3 w-3" />}
                    </span>
                    {t(`dash.website.steps.${name}`)}
                  </button>
                );
              })}
            </nav>

            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
              {step === 'identity' && (
                <>
                  {field(
                    t('dash.website.fields.display_name'),
                    <Input
                      value={form.restaurant_name}
                      disabled={readOnly}
                      onChange={(e) => set('restaurant_name', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.slug'),
                    <Input
                      value={form.slug}
                      disabled={readOnly}
                      onChange={(e) => set('slug', slugify(e.target.value))}
                    />,
                    t('dash.website.fields.slug_hint', { slug: form.slug }),
                  )}
                  {field(
                    t('dash.website.fields.language'),
                    <div className="flex gap-2">
                      {['ar', 'en'].map((code) => (
                        <Button
                          key={code}
                          type="button"
                          variant={form.language === code ? 'default' : 'outline'}
                          size="sm"
                          disabled={readOnly}
                          onClick={() => set('language', code)}
                        >
                          {t(`dash.website.languages.${code}`)}
                        </Button>
                      ))}
                    </div>,
                    t('dash.website.fields.language_hint'),
                  )}
                </>
              )}

              {step === 'design' && (
                <>
                  <DesignPicker
                    themes={state.themes}
                    layouts={state.layouts}
                    theme={form.theme}
                    layout={form.layout}
                    onTheme={(value) => set('theme', value)}
                    onLayout={(value) => set('layout', value)}
                    disabled={readOnly}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ImageField
                      label={t('dash.website.fields.logo')}
                      value={form.logo}
                      aspect="square"
                      disabled={readOnly}
                      onChange={(url) => set('logo', url)}
                    />
                    <ImageField
                      label={t('dash.website.fields.hero_image')}
                      hint={t('dash.website.fields.hero_image_hint')}
                      value={form.hero_image}
                      disabled={readOnly}
                      onChange={(url) => set('hero_image', url)}
                    />
                  </div>
                  {field(
                    t('dash.website.fields.eyebrow'),
                    <Input
                      value={form.eyebrow}
                      disabled={readOnly}
                      onChange={(e) => set('eyebrow', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.hero_title'),
                    <Input
                      value={form.hero_title}
                      disabled={readOnly}
                      onChange={(e) => set('hero_title', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.hero_description'),
                    <Textarea
                      rows={3}
                      value={form.hero_description}
                      disabled={readOnly}
                      onChange={(e) => set('hero_description', e.target.value)}
                    />,
                  )}
                </>
              )}

              {step === 'content' && (
                <>
                  {toggle('show_menu', t('dash.website.fields.show_menu'), t('dash.website.fields.show_menu_hint'))}
                  {Boolean(form.show_menu) &&
                    field(
                      t('dash.website.fields.menu'),
                      <SearchableSelect
                        id="menu"
                        value={form.menu ?? ''}
                        options={state.menus.map((name) => ({ value: name, label: name }))}
                        disabled={readOnly}
                        onChange={(_, value) => set('menu', value || null)}
                        strict
                      />,
                      t('dash.website.fields.menu_hint'),
                    )}

                  {toggle('show_story', t('dash.website.fields.show_story'))}
                  {Boolean(form.show_story) && (
                    <>
                      {field(
                        t('dash.website.fields.story_title'),
                        <Input
                          value={form.story_title}
                          disabled={readOnly}
                          onChange={(e) => set('story_title', e.target.value)}
                        />,
                      )}
                      {field(
                        t('dash.website.fields.story'),
                        <Textarea
                          rows={5}
                          value={form.story}
                          disabled={readOnly}
                          onChange={(e) => set('story', e.target.value)}
                        />,
                      )}
                      <ImageField
                        label={t('dash.website.fields.story_image')}
                        value={form.story_image}
                        disabled={readOnly}
                        onChange={(url) => set('story_image', url)}
                      />
                    </>
                  )}

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-800">
                      {t('dash.website.fields.gallery')}
                    </h3>
                    <GalleryEditor
                      value={form.gallery}
                      max={state.max_gallery_rows}
                      disabled={readOnly}
                      onChange={(rows) => set('gallery', rows)}
                    />
                  </div>
                </>
              )}

              {step === 'visit' && (
                <>
                  {field(
                    t('dash.website.fields.address'),
                    <Textarea
                      rows={2}
                      value={form.address}
                      disabled={readOnly}
                      onChange={(e) => set('address', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.phone'),
                    <Input
                      value={form.phone}
                      disabled={readOnly}
                      onChange={(e) => set('phone', e.target.value)}
                    />,
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {field(
                      t('dash.website.fields.map_url'),
                      <Input
                        value={form.map_url}
                        disabled={readOnly}
                        onChange={(e) => set('map_url', e.target.value)}
                      />,
                    )}
                    {field(
                      t('dash.website.fields.instagram_url'),
                      <Input
                        value={form.instagram_url}
                        disabled={readOnly}
                        onChange={(e) => set('instagram_url', e.target.value)}
                      />,
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-800">
                      {t('dash.website.fields.hours')}
                    </h3>
                    <HoursEditor
                      days={state.days}
                      value={form.hours}
                      disabled={readOnly}
                      onChange={(rows) => set('hours', rows)}
                    />
                  </div>
                </>
              )}

              {step === 'booking' && (
                <>
                  {toggle(
                    'enable_reservations',
                    t('dash.website.fields.enable_reservations'),
                    t('dash.website.fields.enable_reservations_hint'),
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {number('duration_minutes', t('dash.website.fields.duration'), t('dash.website.fields.duration_hint'))}
                    {number('lead_minutes', t('dash.website.fields.lead'), t('dash.website.fields.lead_hint'))}
                    {number('advance_days', t('dash.website.fields.advance'), t('dash.website.fields.advance_hint'))}
                    {number('max_guests', t('dash.website.fields.max_guests'))}
                  </div>
                  {field(
                    t('dash.website.fields.booking_note'),
                    <Textarea
                      rows={3}
                      value={form.booking_note}
                      disabled={readOnly}
                      onChange={(e) => set('booking_note', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.privacy_note'),
                    <Textarea
                      rows={2}
                      value={form.privacy_note}
                      disabled={readOnly}
                      onChange={(e) => set('privacy_note', e.target.value)}
                    />,
                  )}
                </>
              )}

              {step === 'seo' && (
                <>
                  {field(
                    t('dash.website.fields.seo_title'),
                    <Input
                      value={form.seo_title}
                      disabled={readOnly}
                      onChange={(e) => set('seo_title', e.target.value)}
                    />,
                  )}
                  {field(
                    t('dash.website.fields.seo_description'),
                    <Textarea
                      rows={3}
                      value={form.seo_description}
                      disabled={readOnly}
                      onChange={(e) => set('seo_description', e.target.value)}
                    />,
                    t('dash.website.fields.seo_hint'),
                  )}
                  <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600" dir="ltr">
                    {publicUrl(form.slug)}
                  </p>
                </>
              )}
            </section>

            {missing.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  {blocking.length
                    ? t('dash.website.checks.blocking_title')
                    : t('dash.website.checks.advised_title')}
                </h3>
                <ul className="space-y-1.5">
                  {missing.map((item) => (
                    <CheckRow key={item.key} item={item} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
            <LivePreview
              src={previewUrl(form.slug, nonce)}
              device={device}
              onDevice={setDevice}
              onRefresh={() => setNonce(Date.now())}
              openUrl={published ? publicUrl(form.slug) : undefined}
              syncing={syncing}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsiteEditorPage;
