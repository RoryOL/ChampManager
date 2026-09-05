import type { Championship } from "../types";
import { GroupTable } from "../components/GroupTable";

type Props = {
  championship: Championship;
};

export function GroupsPage({ championship }: Props) {
  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Round robin</p>
        <h1>Group tables</h1>
        <p>
          Each club plays the other three in its group once. Two points for a win, one for a draw.
          The top two go into the quarter-finals; the bottom club in each group goes into
          relegation.
        </p>
      </header>
      <div className="groups-grid">
        {championship.groups.map((group) => (
          <GroupTable key={group.id} championship={championship} group={group} />
        ))}
      </div>
    </div>
  );
}
