import { ReservationWorkspace } from "@/components/reservation-workspace";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReservationPage({ params }: Params) {
  const { id } = await params;
  return <ReservationWorkspace reservationId={id} />;
}