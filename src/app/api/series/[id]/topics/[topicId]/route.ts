import { NextResponse } from "next/server";

import { topicRepo, type TopicStatus } from "@/lib/db/topicRepo";

type Params = { params: Promise<{ id: string; topicId: string }> };

const STATUSES: TopicStatus[] = ["planned", "used", "skipped"];

/** Edit a topic, reorder it, or skip it. */
export async function PATCH(req: Request, { params }: Params) {
    const { topicId } = await params;

    try {
        const body = await req.json().catch(() => ({}));

        if (body.status !== undefined && !STATUSES.includes(body.status)) {
            return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
        }

        const topic = await topicRepo.update(topicId, {
            ...(body.title !== undefined ? { title: String(body.title).slice(0, 200) } : {}),
            ...(body.subject !== undefined ? { subject: String(body.subject).slice(0, 120) } : {}),
            ...(body.angle !== undefined ? { angle: String(body.angle).slice(0, 400) } : {}),
            ...(body.status !== undefined ? { status: body.status as TopicStatus } : {}),
            ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
        });

        if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
        return NextResponse.json(topic);
    } catch (error) {
        console.error("[api/topics/:topicId] update failed:", error);
        return NextResponse.json({ error: "Failed to update topic" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: Params) {
    const { topicId } = await params;

    const removed = await topicRepo.remove(topicId);
    if (!removed) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
}
