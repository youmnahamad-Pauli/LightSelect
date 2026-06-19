import { redirect } from 'next/navigation';

export default function ProjectIndexPage({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/overview`);
}
