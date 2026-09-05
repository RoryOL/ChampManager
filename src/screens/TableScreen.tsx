import type { Championship, GameSave } from "../types";
import { GroupTable } from "../components/GroupTable";
import { teamGroup } from "../lib/resolve";

type Props = {
  championship: Championship;
  save: GameSave;
};

export function TableScreen({ championship, save }: Props) {
  const own = teamGroup(championship, save.clubId);
  const groups = [...championship.groups].sort((a, b) => {
    if (a.id === own?.id) return -1;
    if (b.id === own?.id) return 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <div className="screen">
      {groups.map((group) => (
        <GroupTable
          key={group.id}
          championship={championship}
          group={group}
          clubId={save.clubId}
        />
      ))}
    </div>
  );
}
