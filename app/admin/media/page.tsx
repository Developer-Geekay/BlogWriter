import { MediaLibrary } from '@/components/MediaLibrary';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media' };

export default function MediaPage() {
  return <MediaLibrary />;
}
