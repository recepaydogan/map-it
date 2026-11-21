/**
 * The arithmetic behind an optimistic vote, kept away from the component that
 * renders it so it can be reasoned about (and tested) on its own.
 *
 * The server is still the authority — voteComment() returns settled totals and
 * the caller overwrites with those. This only has to be right for the fraction
 * of a second before the round trip lands, and right enough that the number
 * never visibly jumps when it does.
 */

import type { CommentVote, MarkerComment } from "../../services/comments/comments-service";

/** Clicking the vote you already cast takes it back — one button, two states. */
export const nextVote = (current: CommentVote, clicked: 1 | -1): CommentVote =>
  current === clicked ? 0 : clicked;

/**
 * The comment as it will look once `next` is cast. Moving straight from up to
 * down is one action, not two, so both totals move in the same step.
 */
export const applyVote = (comment: MarkerComment, next: CommentVote): MarkerComment => {
  const prev = comment.myVote;
  if (prev === next) return comment;
  return {
    ...comment,
    likeCount: comment.likeCount + (next === 1 ? 1 : 0) - (prev === 1 ? 1 : 0),
    dislikeCount: comment.dislikeCount + (next === -1 ? 1 : 0) - (prev === -1 ? 1 : 0),
    myVote: next,
  };
};
